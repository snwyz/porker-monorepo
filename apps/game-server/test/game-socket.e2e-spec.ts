import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma as database } from "../../../packages/db/src/client.js";
import { createApp } from "../src/main.js";
import { TableRuntimeStore } from "../src/game/table-runtime.js";
import { decryptTableState, encryptTableState } from "../src/game/deck.js";

async function clearDatabase(): Promise<void> {
  await database.tableOperation.deleteMany();
  await database.handEvent.deleteMany();
  await database.gameSnapshot.deleteMany();
  await database.hand.deleteMany();
  await database.seat.deleteMany();
  await database.room.deleteMany();
  await database.session.deleteMany();
  await database.user.deleteMany();
}

function sessionCookie(response: request.Response): string {
  const header = response.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header[0] : header;
  if (!cookie) throw new Error("Missing session cookie");
  return cookie.split(";", 1)[0] as string;
}

async function createGuest(
  app: INestApplication,
  nickname: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post("/v1/guest-session")
    .send({ nickname })
    .expect(201);
  return sessionCookie(response);
}

function connect(url: string, cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      transports: ["websocket"],
      extraHeaders: { Cookie: cookie },
      forceNew: true,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function emitAck<T>(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Ack timeout for ${event}`)),
      1_000,
    );
    socket.emit(event, payload, (result: T) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

function waitForTableEvent(
  socket: Socket,
  type: string,
  timeoutMs = 2_500,
): Promise<{ event: { type: string }; version: number }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Missing ${type}`)),
      timeoutMs,
    );
    const listener = (message: {
      event: { type: string };
      version: number;
    }) => {
      if (message.event.type !== type) return;
      clearTimeout(timeout);
      socket.off("table:event", listener);
      resolve(message);
    };
    socket.on("table:event", listener);
  });
}

describe("authoritative Socket.IO tables", () => {
  let app: INestApplication;
  let baseUrl: string;
  const sockets: Socket[] = [];
  let tableCounter = 0;

  async function createStartedTable(actionTimeoutSeconds = 30) {
    tableCounter += 1;
    const ownerCookie = await createGuest(app, `Owner${tableCounter}`);
    const playerCookie = await createGuest(app, `Player${tableCounter}`);
    const room = await request(app.getHttpServer())
      .post("/v1/rooms")
      .send({
        name: `Table ${tableCounter}`,
        seats: 2,
        smallBlind: 5,
        bigBlind: 10,
        minBuyIn: 100,
        maxBuyIn: 1_000,
        actionTimeoutSeconds,
      })
      .expect(201);
    const owner = await connect(baseUrl, ownerCookie);
    const player = await connect(baseUrl, playerCookie);
    sockets.push(owner, player);
    const ownerJoin = await emitAck<{
      ok: true;
      playerId: string;
      snapshot: null;
    }>(owner, "table:join", { roomId: room.body.id, seat: 0, buyIn: 500 });
    const playerJoin = await emitAck<{
      ok: true;
      playerId: string;
      snapshot: { handId: string; version: number; actorId: string };
    }>(player, "table:join", { roomId: room.body.id, seat: 1, buyIn: 500 });
    return {
      roomId: room.body.id as string,
      owner,
      player,
      ownerCookie,
      playerCookie,
      ownerId: ownerJoin.playerId,
      playerId: playerJoin.playerId,
      snapshot: playerJoin.snapshot,
    };
  }

  beforeAll(async () => {
    process.env.APP_MODE = "points";
    process.env.POKER_AUDIT_KEY = "test-audit-key-with-at-least-32-bytes";
    process.env.POKER_TIMEOUT_SCALE = "0.05";
    process.env.POKER_DISCONNECT_GRACE_MS = "200";
    await clearDatabase();
    app = await createApp();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await clearDatabase();
    await app.close();
  });

  it("applies a repeated actionId once and resends the original result", async () => {
    const ownerCookie = await createGuest(app, "SocketOwner");
    const playerCookie = await createGuest(app, "SocketPlayer");
    const room = await request(app.getHttpServer())
      .post("/v1/rooms")
      .send({
        name: "Socket Table",
        seats: 2,
        smallBlind: 5,
        bigBlind: 10,
        minBuyIn: 100,
        maxBuyIn: 1_000,
        actionTimeoutSeconds: 30,
      })
      .expect(201);
    const owner = await connect(baseUrl, ownerCookie);
    const player = await connect(baseUrl, playerCookie);
    sockets.push(owner, player);

    await emitAck(owner, "table:join", {
      roomId: room.body.id,
      seat: 0,
      buyIn: 500,
    });
    const joined = await emitAck<{
      ok: true;
      snapshot: { handId: string; version: number; actorId: string };
      playerId: string;
    }>(player, "table:join", {
      roomId: room.body.id,
      seat: 1,
      buyIn: 500,
    });
    const actor = joined.snapshot.actorId === joined.playerId ? player : owner;
    const action = {
      roomId: room.body.id,
      handId: joined.snapshot.handId,
      actionId: "same-id",
      expectedVersion: joined.snapshot.version,
      type: "call",
    };

    const first = await emitAck(actor, "table:action", action);
    const repeated = await emitAck(actor, "table:action", action);

    expect(repeated).toEqual(first);
    const events = await database.$queryRawUnsafe<Array<{ actionId: string }>>(
      'SELECT "actionId" FROM "HandEvent" WHERE "handId" = $1 AND "actionId" = $2',
      action.handId,
      action.actionId,
    );
    expect(events).toHaveLength(1);
  });

  it("replays committed events missed while the owning player reconnects", async () => {
    const table = await createStartedTable();
    const actor =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    const actorCookie =
      table.snapshot.actorId === table.ownerId
        ? table.ownerCookie
        : table.playerCookie;
    const actorSeat = table.snapshot.actorId === table.ownerId ? 0 : 1;
    await emitAck(actor, "table:action", {
      roomId: table.roomId,
      handId: table.snapshot.handId,
      actionId: `replay-${tableCounter}`,
      expectedVersion: 0,
      type: "call",
    });
    actor.disconnect();
    const reconnected = await connect(baseUrl, actorCookie);
    sockets.push(reconnected);

    const joined = await emitAck<{
      ok: true;
      snapshot: { version: number };
      replay: Array<{ type: string }>;
    }>(reconnected, "table:join", {
      roomId: table.roomId,
      seat: actorSeat,
      buyIn: 500,
      sinceVersion: 0,
    });

    expect(joined.snapshot.version).toBe(1);
    expect(joined.replay.map((event) => event.type)).toContain("player-called");
  });

  it("falls back to an authoritative snapshot when replay continuity is impossible", async () => {
    const table = await createStartedTable();
    const joined = await emitAck<{
      ok: true;
      sync: "snapshot" | "replay";
      snapshot: { version: number };
      replay: unknown[];
    }>(table.owner, "table:join", {
      roomId: table.roomId,
      seat: 0,
      buyIn: 500,
      sinceVersion: 999,
    });

    expect(joined.sync).toBe("snapshot");
    expect(joined.snapshot.version).toBe(0);
    expect(joined.replay).toEqual([]);
  });

  it("auto-folds when a timed-out actor is facing a wager", async () => {
    const table = await createStartedTable(10);
    const event = await waitForTableEvent(table.player, "player-folded");

    expect(event.version).toBe(2);
    const timedOut = await database.handEvent.findFirst({
      where: {
        handId: table.snapshot.handId,
        actionId: { startsWith: "timeout:" },
      },
    });
    expect(timedOut?.type).toBe("player-folded");
  });

  it("auto-checks when a timed-out actor owes no chips", async () => {
    const table = await createStartedTable(10);
    const firstActor =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    const secondActor = firstActor === table.owner ? table.player : table.owner;
    await emitAck(firstActor, "table:action", {
      roomId: table.roomId,
      handId: table.snapshot.handId,
      actionId: `timeout-call-${tableCounter}`,
      expectedVersion: 0,
      type: "call",
    });
    await emitAck(secondActor, "table:action", {
      roomId: table.roomId,
      handId: table.snapshot.handId,
      actionId: `timeout-check-${tableCounter}`,
      expectedVersion: 1,
      type: "check",
    });

    const event = await waitForTableEvent(table.owner, "player-checked");
    expect(event.version).toBe(3);
    const automatic = await database.handEvent.findFirst({
      where: {
        handId: table.snapshot.handId,
        actionId: `timeout:${table.snapshot.handId}:2`,
      },
    });
    expect(automatic?.type).toBe("player-checked");
  });

  it("reconstructs a table runtime from the durable snapshot after a process-style restart", async () => {
    const table = await createStartedTable();
    app.get(TableRuntimeStore).clear(table.roomId);

    const recovered = await emitAck<{
      ok: true;
      snapshot: { handId: string; version: number; deck: unknown[] };
    }>(table.owner, "table:snapshot", { roomId: table.roomId });

    expect(recovered.snapshot).toMatchObject({
      handId: table.snapshot.handId,
      version: 0,
      deck: [],
    });
  });

  it("marks a room draining instead of serving an invalid durable event chain", async () => {
    const table = await createStartedTable();
    const actor =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    await emitAck(actor, "table:action", {
      roomId: table.roomId,
      handId: table.snapshot.handId,
      actionId: `broken-${tableCounter}`,
      expectedVersion: 0,
      type: "call",
    });
    await database.handEvent.updateMany({
      where: { handId: table.snapshot.handId },
      data: { sequence: 99 },
    });
    app.get(TableRuntimeStore).clear(table.roomId);

    const result = await emitAck<{ ok: false; code: string }>(
      table.owner,
      "table:snapshot",
      { roomId: table.roomId },
    );

    expect(result).toEqual({ ok: false, code: "HAND_NOT_FOUND" });
    expect(
      (await database.room.findUniqueOrThrow({ where: { id: table.roomId } }))
        .status,
    ).toBe("DRAINING");
  });

  it("preserves seat ownership during grace and auto-folds after grace expires", async () => {
    const table = await createStartedTable();
    const actor =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    const observer = actor === table.owner ? table.player : table.owner;
    const actorCookie =
      actor === table.owner ? table.ownerCookie : table.playerCookie;
    const actorSeat = actor === table.owner ? 0 : 1;
    actor.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 75));
    const reconnected = await connect(baseUrl, actorCookie);
    sockets.push(reconnected);
    const reclaimed = await emitAck<{
      ok: true;
      snapshot: { version: number };
    }>(reconnected, "table:join", {
      roomId: table.roomId,
      seat: actorSeat,
      buyIn: 500,
    });
    expect(reclaimed.snapshot.version).toBe(0);
    expect(
      await database.ledgerTransaction.count({
        where: { reference: { startsWith: `buy-in:${table.roomId}:` } },
      }),
    ).toBe(2);

    const folded = waitForTableEvent(observer, "player-folded", 1_000);
    reconnected.disconnect();
    expect((await folded).version).toBe(2);
  });

  it("lets the authenticated owner leave and settles only their durable stack", async () => {
    const table = await createStartedTable();
    const actor =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    const observer = actor === table.owner ? table.player : table.owner;
    const actorId = table.snapshot.actorId;
    await emitAck(actor, "table:action", {
      roomId: table.roomId,
      handId: table.snapshot.handId,
      actionId: `leave-fold-${tableCounter}`,
      expectedVersion: 0,
      type: "fold",
    });
    const leaveEvent = new Promise<{ userId: string; cashOut: string }>(
      (resolve) => {
        observer.once("table:leave", resolve);
      },
    );

    const result = await emitAck<{
      ok: true;
      userId: string;
      cashOut: string;
    }>(actor, "table:leave", {
      roomId: table.roomId,
      actionId: `leave-${tableCounter}`,
    });

    expect(result).toMatchObject({ ok: true, userId: actorId, cashOut: "495" });
    expect(await leaveEvent).toMatchObject({ userId: actorId, cashOut: "495" });
    expect(
      await database.seat.findFirst({
        where: { roomId: table.roomId, userId: actorId },
      }),
    ).toBeNull();
    const balance = await database.ledgerEntry.aggregate({
      where: { accountId: `points:${actorId}` },
      _sum: { amount: true },
    });
    expect(balance._sum.amount).toBe(9_995n);
  });

  it("settles an early-fold pot before commit and stores no plaintext private cards", async () => {
    const table = await createStartedTable();
    const actor =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    const actorId = table.snapshot.actorId;
    const knownCard = (
      await emitAck<{
        ok: true;
        snapshot: { holeCards: Record<string, Array<{ code: string }>> };
      }>(actor, "table:snapshot", { roomId: table.roomId })
    ).snapshot.holeCards[actorId]![0]!.code;
    const result = await emitAck<{ ok: true; version: number }>(
      actor,
      "table:action",
      {
        roomId: table.roomId,
        handId: table.snapshot.handId,
        actionId: `settle-fold-${tableCounter}`,
        expectedVersion: 0,
        type: "fold",
      },
    );
    const settled = await emitAck<{
      ok: true;
      snapshot: {
        players: Array<{
          stack: number;
          handCommitted: number;
          streetCommitted: number;
        }>;
      };
    }>(table.player, "table:snapshot", { roomId: table.roomId });
    expect(result.version).toBe(2);
    expect(
      settled.snapshot.players.reduce((sum, player) => sum + player.stack, 0),
    ).toBe(1_000);
    expect(
      settled.snapshot.players.every(
        (player) => player.handCommitted === 0 && player.streetCommitted === 0,
      ),
    ).toBe(true);
    const durable = await database.gameSnapshot.findFirstOrThrow({
      where: { handId: table.snapshot.handId },
      orderBy: { id: "desc" },
    });
    expect(JSON.stringify(durable.state)).not.toContain(
      `"code":"${knownCard}"`,
    );
    expect(JSON.stringify(durable.state)).not.toContain('"holeCards"');
    expect(JSON.stringify(durable.state)).not.toContain('"deck"');
    const settlement = await database.handEvent.findFirstOrThrow({
      where: { handId: table.snapshot.handId, type: "hand-settled" },
    });
    expect(settlement.payload).toMatchObject({
      pot: 15,
      awards: { [table.playerId]: 15 },
    });
    const winnerLeave = await emitAck<{ ok: true; cashOut: string }>(
      table.player,
      "table:leave",
      { roomId: table.roomId, actionId: `winner-leave-${tableCounter}` },
    );
    expect(winnerLeave.cashOut).toBe("505");
  });

  it("does not let an expired non-actor grace act for the connected actor", async () => {
    const table = await createStartedTable();
    const actor =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    const nonActor = actor === table.owner ? table.player : table.owner;
    nonActor.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const before = await emitAck<{ ok: true; snapshot: { version: number } }>(
      actor,
      "table:snapshot",
      {
        roomId: table.roomId,
      },
    );
    expect(before.snapshot.version).toBe(0);
    await emitAck(actor, "table:action", {
      roomId: table.roomId,
      handId: table.snapshot.handId,
      actionId: `nonactor-call-${tableCounter}`,
      expectedVersion: 0,
      type: "call",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const after = await emitAck<{ ok: true; snapshot: { version: number } }>(
      actor,
      "table:snapshot",
      {
        roomId: table.roomId,
      },
    );
    expect(after.snapshot.version).toBeGreaterThanOrEqual(2);
  });

  it("blocks join after recovery marks a corrupt room draining", async () => {
    const table = await createStartedTable();
    await database.gameSnapshot.updateMany({
      where: { handId: table.snapshot.handId },
      data: { state: { malformed: true } },
    });
    app.get(TableRuntimeStore).clear(table.roomId);
    await emitAck(table.owner, "table:snapshot", { roomId: table.roomId });

    const joined = await emitAck<{ ok: false; code: string }>(
      table.owner,
      "table:join",
      {
        roomId: table.roomId,
        seat: 0,
        buyIn: 500,
      },
    );
    expect(joined).toEqual({ ok: false, code: "ROOM_DRAINING" });
    expect(await database.hand.count({ where: { roomId: table.roomId } })).toBe(
      1,
    );
  });

  it("revalidates a socket session after connect before every operation", async () => {
    const table = await createStartedTable();
    const actor =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    const actorId = table.snapshot.actorId;
    await database.session.updateMany({
      where: { userId: actorId },
      data: { revokedAt: new Date() },
    });
    const action = await emitAck<{ ok: false; code: string }>(
      actor,
      "table:action",
      {
        roomId: table.roomId,
        handId: table.snapshot.handId,
        actionId: `revoked-${tableCounter}`,
        expectedVersion: 0,
        type: "call",
      },
    );
    expect(action).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    expect(
      await emitAck(actor, "table:leave", {
        roomId: table.roomId,
        actionId: `revoked-leave-${tableCounter}`,
      }),
    ).toEqual({ ok: false, code: "UNAUTHENTICATED" });
  });

  it("settles a multi-contender all-in showdown and conserves table funds", async () => {
    const table = await createStartedTable();
    const first =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    const second = first === table.owner ? table.player : table.owner;
    await emitAck(first, "table:action", {
      roomId: table.roomId,
      handId: table.snapshot.handId,
      actionId: `allin-raise-${tableCounter}`,
      expectedVersion: 0,
      type: "raise",
      amount: 500,
    });
    const result = await emitAck<{ ok: true; version: number }>(
      second,
      "table:action",
      {
        roomId: table.roomId,
        handId: table.snapshot.handId,
        actionId: `allin-call-${tableCounter}`,
        expectedVersion: 1,
        type: "call",
      },
    );
    const snapshot = (
      await emitAck<{
        ok: true;
        snapshot: {
          board: unknown[];
          players: Array<{
            stack: number;
            handCommitted: number;
            streetCommitted: number;
          }>;
        };
      }>(first, "table:snapshot", { roomId: table.roomId })
    ).snapshot;
    expect(result.version).toBe(3);
    expect(snapshot.board).toHaveLength(5);
    expect(
      snapshot.players.reduce((sum, player) => sum + player.stack, 0),
    ).toBe(1_000);
    expect(
      snapshot.players.every(
        (player) => player.handCommitted === 0 && player.streetCommitted === 0,
      ),
    ).toBe(true);
  });

  it("restores an authoritative action deadline and executes it after runtime loss", async () => {
    const table = await createStartedTable(10);
    app.get(TableRuntimeStore).clear(table.roomId);
    await emitAck(table.owner, "table:snapshot", { roomId: table.roomId });
    const folded = await waitForTableEvent(
      table.player,
      "player-folded",
      1_200,
    );
    expect(folded.version).toBe(2);
  });

  it("drains on wrong snapshot key or malformed actor identity", async () => {
    const table = await createStartedTable();
    const latest = await database.gameSnapshot.findFirstOrThrow({
      where: { handId: table.snapshot.handId },
      orderBy: { id: "desc" },
    });
    const state = decryptTableState(
      "test-audit-key-with-at-least-32-bytes",
      latest.state,
    ) as Record<string, unknown>;
    await database.gameSnapshot.update({
      where: { id: latest.id },
      data: {
        state: {
          ...encryptTableState("wrong-audit-key-with-at-least-32-bytes", {
            ...state,
            actorId: "not-seated",
          }),
        },
      },
    });
    app.get(TableRuntimeStore).clear(table.roomId);
    expect(
      await emitAck(table.owner, "table:snapshot", { roomId: table.roomId }),
    ).toEqual({ ok: false, code: "HAND_NOT_FOUND" });
    expect(
      (await database.room.findUniqueOrThrow({ where: { id: table.roomId } }))
        .status,
    ).toBe("DRAINING");
  });

  it("scopes a concurrent actionId race and never broadcasts the losing transition", async () => {
    const left = await createStartedTable();
    const right = await createStartedTable();
    const leftActor =
      left.snapshot.actorId === left.ownerId ? left.owner : left.player;
    const rightActor =
      right.snapshot.actorId === right.ownerId ? right.owner : right.player;
    let leftEvents = 0;
    let rightEvents = 0;
    left.owner.on("table:event", () => (leftEvents += 1));
    right.owner.on("table:event", () => (rightEvents += 1));
    const actionId = `cross-room-${tableCounter}`;
    const [one, two] = await Promise.all([
      emitAck<{ ok: boolean; code?: string }>(leftActor, "table:action", {
        roomId: left.roomId,
        handId: left.snapshot.handId,
        actionId,
        expectedVersion: 0,
        type: "call",
      }),
      emitAck<{ ok: boolean; code?: string }>(rightActor, "table:action", {
        roomId: right.roomId,
        handId: right.snapshot.handId,
        actionId,
        expectedVersion: 0,
        type: "call",
      }),
    ]);
    expect([one, two].filter((result) => result.ok)).toHaveLength(1);
    expect(
      [one, two].filter((result) => result.code === "ACTION_ID_CONFLICT"),
    ).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect([leftEvents, rightEvents].sort()).toEqual([0, 1]);
    expect(await database.handEvent.count({ where: { actionId } })).toBe(1);
  });

  it("returns ROOM_DRAINING when join itself first discovers corruption", async () => {
    const table = await createStartedTable();
    await database.gameSnapshot.updateMany({
      where: { handId: table.snapshot.handId },
      data: { state: { corrupt: true } },
    });
    app.get(TableRuntimeStore).clear(table.roomId);
    const joined = await emitAck<{ ok: false; code: string }>(
      table.owner,
      "table:join",
      {
        roomId: table.roomId,
        seat: 0,
        buyIn: 500,
      },
    );
    expect(joined).toEqual({ ok: false, code: "ROOM_DRAINING" });
    expect(await database.hand.count({ where: { roomId: table.roomId } })).toBe(
      1,
    );
  });

  it("returns the original leave ack after seat deletion and rejects cross-room reuse", async () => {
    const table = await createStartedTable();
    const actor =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    await emitAck(actor, "table:action", {
      roomId: table.roomId,
      handId: table.snapshot.handId,
      actionId: `leave-idem-fold-${tableCounter}`,
      expectedVersion: 0,
      type: "fold",
    });
    const actionId = `leave-idem-${tableCounter}`;
    const cashOutsBefore = await database.ledgerTransaction.count({
      where: { reference: { startsWith: "cash-out:" } },
    });
    const first = await emitAck(actor, "table:leave", {
      roomId: table.roomId,
      actionId,
    });
    const retry = await emitAck(actor, "table:leave", {
      roomId: table.roomId,
      actionId,
    });
    expect(retry).toEqual(first);
    expect(
      await database.ledgerTransaction.count({
        where: { reference: { startsWith: "cash-out:" } },
      }),
    ).toBe(cashOutsBefore + 1);
    const other = await createStartedTable();
    expect(
      await emitAck(actor, "table:leave", { roomId: other.roomId, actionId }),
    ).toEqual({ ok: false, code: "ACTION_ID_CONFLICT" });
  });

  it("rejects a two-version recovery jump without a paired settlement event", async () => {
    const table = await createStartedTable();
    const actor =
      table.snapshot.actorId === table.ownerId ? table.owner : table.player;
    await emitAck(actor, "table:action", {
      roomId: table.roomId,
      handId: table.snapshot.handId,
      actionId: `unpaired-settlement-${tableCounter}`,
      expectedVersion: 0,
      type: "fold",
    });
    await database.handEvent.deleteMany({
      where: { handId: table.snapshot.handId, type: "hand-settled" },
    });
    app.get(TableRuntimeStore).clear(table.roomId);

    expect(
      await emitAck(table.owner, "table:snapshot", { roomId: table.roomId }),
    ).toEqual({ ok: false, code: "HAND_NOT_FOUND" });
    expect(
      (await database.room.findUniqueOrThrow({ where: { id: table.roomId } }))
        .status,
    ).toBe("DRAINING");
  });

  it("proactively recovers and executes an overdue action after app restart without client wakeup", async () => {
    const table = await createStartedTable(10);
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 600));
    app = await createApp();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const automatic = await database.handEvent.findFirst({
      where: {
        handId: table.snapshot.handId,
        actionId: { startsWith: "timeout:" },
      },
    });
    expect(automatic).not.toBeNull();
  });
});
