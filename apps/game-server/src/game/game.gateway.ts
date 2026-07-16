import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { createHash, randomUUID } from "node:crypto";
import {
  applyCommandResult,
  legalActions,
  startHand,
  type GameEvent,
  type TableState,
} from "@poker/engine";
import { findActiveGuestSession } from "@poker/db";
import { PlayerActionSchema } from "@poker/shared";
import { z } from "zod";
import type { Server, Socket } from "socket.io";

import { AUDIT_KEY } from "../config/tokens.js";
import { createAuditableDeck, encryptDeckAudit } from "./deck.js";
import { RecoveryService } from "./recovery.service.js";
import { TableRepository } from "./table-repository.js";
import { TableRuntimeStore } from "./table-runtime.js";

const JoinSchema = z.object({
  roomId: z.string().min(1),
  seat: z.number().int().nonnegative(),
  buyIn: z.number().int().positive(),
  sinceVersion: z.number().int().nonnegative().optional(),
});

interface SocketIdentity {
  userId: string;
  displayName: string;
}

type PokerSocket = Socket & {
  data: {
    identityPromise?: Promise<SocketIdentity | null>;
    identity?: SocketIdentity | null;
    joinedRooms?: Set<string>;
  };
};

function tokenFromCookie(cookieHeader: string | undefined): string | null {
  const value = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("poker_session="))
    ?.slice("poker_session=".length);
  return value ? decodeURIComponent(value) : null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function playerView(state: TableState, userId: string) {
  return {
    ...state,
    deck: [],
    holeCards: state.holeCards[userId]
      ? { [userId]: state.holeCards[userId] }
      : {},
  };
}

@Injectable()
@WebSocketGateway({ cors: false })
export class GameGateway
  implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;
  private readonly disconnectTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly repository: TableRepository,
    private readonly runtimes: TableRuntimeStore,
    private readonly recovery: RecoveryService,
    @Inject(AUDIT_KEY) private readonly auditKey: string,
  ) {}

  afterInit(): void {}

  onModuleDestroy(): void {
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
  }

  handleConnection(socket: PokerSocket): void {
    const token = tokenFromCookie(socket.handshake.headers.cookie);
    socket.data.identityPromise = (
      token
        ? findActiveGuestSession(hashToken(token), new Date())
        : Promise.resolve(null)
    ).then((identity) => {
      socket.data.identity = identity;
      return identity;
    });
    socket.data.joinedRooms = new Set();
  }

  handleDisconnect(socket: PokerSocket): void {
    void this.scheduleDisconnectGrace(socket);
  }

  private async scheduleDisconnectGrace(socket: PokerSocket): Promise<void> {
    const identity = await this.identity(socket);
    if (!identity) return;
    const graceMs = Number(process.env.POKER_DISCONNECT_GRACE_MS ?? "15000");
    for (const roomId of socket.data.joinedRooms ?? []) {
      const key = `${roomId}:${identity.userId}`;
      const existing = this.disconnectTimers.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(
        () => {
          void (async () => {
            const sockets = await this.server.in(roomId).fetchSockets();
            const reconnected = sockets.some(
              (candidate) =>
                (candidate.data as { identity?: SocketIdentity }).identity
                  ?.userId === identity.userId,
            );
            if (!reconnected) {
              await this.performAutomaticAction(roomId).catch(() =>
                this.repository.setDraining(roomId),
              );
            }
            this.disconnectTimers.delete(key);
          })();
        },
        Number.isFinite(graceMs) && graceMs >= 0 ? graceMs : 15_000,
      );
      this.disconnectTimers.set(key, timer);
    }
  }

  private async identity(socket: PokerSocket): Promise<SocketIdentity | null> {
    return (await socket.data.identityPromise) ?? null;
  }

  private failure(socket: PokerSocket, code: string, version?: number) {
    const result = {
      ok: false as const,
      code,
      ...(version === undefined ? {} : { version }),
    };
    socket.emit("table:error", result);
    return result;
  }

  private broadcastEvents(
    roomId: string,
    handId: string,
    version: number,
    events: readonly GameEvent[],
  ): void {
    for (const event of events) {
      this.server.to(roomId).emit("table:event", { handId, version, event });
    }
  }

  private scheduleTimeout(roomId: string, timeoutSeconds: number): void {
    const runtime = this.runtimes.get(roomId);
    if (!runtime || runtime.state.phase === "complete") return;
    if (runtime.actionTimer) clearTimeout(runtime.actionTimer);
    const scale = Number(process.env.POKER_TIMEOUT_SCALE ?? "1");
    const delay =
      timeoutSeconds *
      1_000 *
      (Number.isFinite(scale) && scale > 0 ? scale : 1);
    runtime.actionTimer = setTimeout(() => {
      void this.performAutomaticAction(roomId).catch(() =>
        this.repository.setDraining(roomId),
      );
    }, delay);
  }

  private async performAutomaticAction(roomId: string): Promise<void> {
    await this.runtimes.withLock(roomId, async () => {
      const current = await this.recovery.recover(roomId);
      if (!current || current.state.phase === "complete") return;
      const actorUserId = current.state.actorId;
      const type = legalActions(current.state, actorUserId).some(
        (action) => action.type === "check",
      )
        ? ("check" as const)
        : ("fold" as const);
      const actionId = `timeout:${current.state.handId}:${current.state.version}`;
      if (await this.repository.findAction(actionId)) return;
      const result = applyCommandResult(current.state, {
        type,
        playerId: actorUserId,
        expectedVersion: current.state.version,
      });
      if (!result.ok) return;
      const ack = {
        ok: true as const,
        actionId,
        version: result.transition.state.version,
        events: result.transition.events,
        automatic: true,
      };
      await this.repository.commitAction({
        roomId,
        handId: current.state.handId,
        actionId,
        actorUserId,
        expectedVersion: current.state.version,
        events: result.transition.events.map((event) => ({
          type: event.type,
          payload: event,
        })),
        state: result.transition.state,
        ack,
        seatStacks: result.transition.state.players.map((player) => ({
          userId: player.id,
          stack: BigInt(player.stack),
        })),
      });
      current.state = result.transition.state;
      this.broadcastEvents(
        roomId,
        current.state.handId,
        current.state.version,
        result.transition.events,
      );
      const room = await this.repository.findRoom(roomId);
      if (room) this.scheduleTimeout(roomId, room.actionTimeoutSeconds);
    });
  }

  @SubscribeMessage("table:join")
  async join(
    @ConnectedSocket() socket: PokerSocket,
    @MessageBody() raw: unknown,
  ) {
    const parsed = JoinSchema.safeParse(raw);
    if (!parsed.success) return this.failure(socket, "INVALID_JOIN");
    const identity = await this.identity(socket);
    if (!identity) return this.failure(socket, "UNAUTHENTICATED");
    const input = parsed.data;
    return this.runtimes.withLock(input.roomId, async () => {
      const room = await this.repository.findRoom(input.roomId);
      if (!room) return this.failure(socket, "ROOM_NOT_FOUND");
      try {
        await this.repository.claimSeat({
          roomId: input.roomId,
          userId: identity.userId,
          seatNumber: input.seat,
          buyIn: BigInt(input.buyIn),
        });
      } catch (error) {
        return this.failure(
          socket,
          error instanceof Error ? error.message : "JOIN_FAILED",
        );
      }
      await socket.join(input.roomId);
      socket.data.joinedRooms?.add(input.roomId);
      const disconnectKey = `${input.roomId}:${identity.userId}`;
      const disconnectTimer = this.disconnectTimers.get(disconnectKey);
      if (disconnectTimer) clearTimeout(disconnectTimer);
      this.disconnectTimers.delete(disconnectKey);

      let runtime = await this.recovery.recover(input.roomId);
      if (!runtime) {
        const seats = await this.repository.listSeats(input.roomId);
        if (seats.length >= 2) {
          const audit = createAuditableDeck();
          const handId = randomUUID();
          const state = startHand({
            tableId: input.roomId,
            handId,
            players: seats.map((seat) => ({
              id: seat.userId,
              stack: Number(seat.stack),
            })),
            buttonSeat: 0,
            blinds: [Number(room.smallBlind), Number(room.bigBlind)],
            deck: audit.deck,
          });
          await this.repository.createHand({
            roomId: input.roomId,
            handId,
            state,
            encryptedAudit: encryptDeckAudit(this.auditKey, audit),
            seatStacks: state.players.map((player) => ({
              userId: player.id,
              stack: BigInt(player.stack),
            })),
          });
          runtime = { state };
          this.runtimes.set(input.roomId, runtime);
          this.server.to(input.roomId).emit("table:snapshot", {
            handId,
            version: state.version,
          });
          this.scheduleTimeout(input.roomId, room.actionTimeoutSeconds);
        }
      }

      const canReplay =
        runtime !== null &&
        input.sinceVersion !== undefined &&
        input.sinceVersion <= runtime.state.version &&
        runtime.state.version - input.sinceVersion <= 100;
      return {
        ok: true as const,
        playerId: identity.userId,
        snapshot: runtime ? playerView(runtime.state, identity.userId) : null,
        sync:
          input.sinceVersion === undefined
            ? "snapshot"
            : canReplay
              ? "replay"
              : "snapshot",
        replay:
          canReplay && runtime && input.sinceVersion !== undefined
            ? (
                await this.repository.loadEventsSinceVersion(
                  runtime.state.handId,
                  input.sinceVersion,
                )
              ).map((event) => event.payload)
            : [],
      };
    });
  }

  @SubscribeMessage("table:action")
  async action(
    @ConnectedSocket() socket: PokerSocket,
    @MessageBody() raw: unknown,
  ) {
    const parsed = PlayerActionSchema.safeParse(raw);
    if (!parsed.success) return this.failure(socket, "INVALID_ACTION");
    const identity = await this.identity(socket);
    if (!identity) return this.failure(socket, "UNAUTHENTICATED");
    const action = parsed.data;
    return this.runtimes.withLock(action.roomId, async () => {
      const seats = await this.repository.listSeats(action.roomId);
      if (!seats.some((seat) => seat.userId === identity.userId)) {
        return this.failure(socket, "NOT_SEAT_OWNER");
      }
      const existing = await this.repository.findAction(action.actionId);
      if (existing) {
        if (
          existing.handId !== action.handId ||
          existing.actorUserId !== identity.userId
        ) {
          return this.failure(socket, "ACTION_ID_CONFLICT");
        }
        return existing.ack;
      }
      const runtime = await this.recovery.recover(action.roomId);
      if (!runtime || runtime.state.handId !== action.handId) {
        return this.failure(socket, "HAND_NOT_FOUND");
      }
      if (action.expectedVersion !== runtime.state.version) {
        return this.failure(socket, "STALE_VERSION", runtime.state.version);
      }
      const result = applyCommandResult(runtime.state, {
        ...action,
        playerId: identity.userId,
      });
      if (!result.ok) return this.failure(socket, result.code, result.version);
      const ack = {
        ok: true as const,
        actionId: action.actionId,
        version: result.transition.state.version,
        events: result.transition.events,
      };
      const committed = await this.repository.commitAction({
        roomId: action.roomId,
        handId: action.handId,
        actionId: action.actionId,
        actorUserId: identity.userId,
        expectedVersion: action.expectedVersion,
        events: result.transition.events.map((event) => ({
          type: event.type,
          payload: event,
        })),
        state: result.transition.state,
        ack,
        seatStacks: result.transition.state.players.map((player) => ({
          userId: player.id,
          stack: BigInt(player.stack),
        })),
      });
      runtime.state = result.transition.state;
      this.broadcastEvents(
        action.roomId,
        action.handId,
        runtime.state.version,
        result.transition.events,
      );
      const room = await this.repository.findRoom(action.roomId);
      if (room) this.scheduleTimeout(action.roomId, room.actionTimeoutSeconds);
      return committed.ack;
    });
  }

  @SubscribeMessage("table:leave")
  async leave(
    @ConnectedSocket() socket: PokerSocket,
    @MessageBody() raw: unknown,
  ) {
    const identity = await this.identity(socket);
    if (!identity) return this.failure(socket, "UNAUTHENTICATED");
    const roomId = z
      .string()
      .min(1)
      .safeParse((raw as { roomId?: unknown })?.roomId);
    if (!roomId.success) return this.failure(socket, "INVALID_LEAVE");
    return this.runtimes.withLock(roomId.data, async () => {
      const runtime = await this.recovery.recover(roomId.data);
      if (runtime && runtime.state.phase !== "complete") {
        return this.failure(socket, "HAND_IN_PROGRESS", runtime.state.version);
      }
      try {
        const cashOut = await this.repository.releaseSeat({
          roomId: roomId.data,
          userId: identity.userId,
        });
        const result = {
          ok: true as const,
          userId: identity.userId,
          cashOut: cashOut.toString(),
        };
        this.server.to(roomId.data).emit("table:leave", result);
        await socket.leave(roomId.data);
        socket.data.joinedRooms?.delete(roomId.data);
        return result;
      } catch (error) {
        return this.failure(
          socket,
          error instanceof Error ? error.message : "LEAVE_FAILED",
        );
      }
    });
  }

  @SubscribeMessage("table:snapshot")
  async snapshot(
    @ConnectedSocket() socket: PokerSocket,
    @MessageBody() raw: unknown,
  ) {
    const identity = await this.identity(socket);
    if (!identity) return this.failure(socket, "UNAUTHENTICATED");
    const roomId = z
      .string()
      .min(1)
      .safeParse((raw as { roomId?: unknown })?.roomId);
    if (!roomId.success)
      return this.failure(socket, "INVALID_SNAPSHOT_REQUEST");
    const runtime = await this.recovery.recover(roomId.data);
    return runtime
      ? {
          ok: true as const,
          snapshot: playerView(runtime.state, identity.userId),
        }
      : this.failure(socket, "HAND_NOT_FOUND");
  }
}
