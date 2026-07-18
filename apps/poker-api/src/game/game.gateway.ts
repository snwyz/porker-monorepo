import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
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
  assertInvariants,
  legalActions,
  settleShowdown,
  startHand,
  type GameEvent,
  type TableState,
} from "@poker/engine";
import { findActiveGuestSession } from "@poker/db";
import {
  PlayerActionSchema,
  TableJoinSchema,
  TableLeaveSchema,
  TableRoomRequestSchema,
} from "@poker/shared";
import type { Server, Socket } from "socket.io";

import { AUDIT_KEY } from "../config/tokens.js";
import { localeFromSocketHandshake } from "../i18n/locale-from-request.js";
import { socketProblem, type LocalizedProblem } from "../i18n/message-code.js";
import {
  createAuditableDeck,
  encryptDeckAudit,
  encryptTableState,
} from "./deck.js";
import { RecoveryService } from "./recovery.service.js";
import { TableRepository } from "./table-repository.js";
import { TableRuntimeStore, type TableRuntime } from "./table-runtime.js";

interface SocketIdentity {
  userId: string;
  displayName: string;
}

type PokerSocket = Socket & {
  data: {
    identityPromise?: Promise<SocketIdentity | null>;
    identity?: SocketIdentity | null;
    tokenHash?: string;
    locale?: "en" | "zh-CN";
    userId?: string;
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
    legalActions: legalActions(state, userId),
    deck: [],
    holeCards: state.holeCards[userId]
      ? { [userId]: state.holeCards[userId] }
      : {},
  };
}

@Injectable()
@WebSocketGateway({ cors: false })
export class GameGateway
  implements
    OnGatewayInit,
    OnGatewayDisconnect,
    OnModuleDestroy,
    OnApplicationBootstrap
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

  async onApplicationBootstrap(): Promise<void> {
    for (const roomId of await this.repository.listRecoveryRooms()) {
      const recovery = await this.recovery.recoverResult(roomId);
      if (recovery.kind !== "READY") continue;
      const runtime = recovery.runtime;
      if (runtime.actionDeadlineAt && runtime.state.phase !== "complete") {
        this.scheduleTimeout(roomId, runtime.actionDeadlineAt);
        await this.armRecoveredGrace(roomId, runtime);
      }
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
  }

  handleConnection(socket: PokerSocket): void {
    const token = tokenFromCookie(socket.handshake.headers.cookie);
    socket.data.tokenHash = token ? hashToken(token) : undefined;
    socket.data.locale = localeFromSocketHandshake(socket.handshake);
    socket.data.identityPromise = (
      socket.data.tokenHash
        ? findActiveGuestSession(socket.data.tokenHash, new Date())
        : Promise.resolve(null)
    ).then((identity) => {
      socket.data.identity = identity;
      socket.data.userId = identity?.userId;
      return identity;
    });
    socket.data.joinedRooms = new Set();
  }

  handleDisconnect(socket: PokerSocket): void {
    void this.scheduleDisconnectGrace(socket).catch(() => undefined);
  }

  private async scheduleDisconnectGrace(socket: PokerSocket): Promise<void> {
    const userId = socket.data.userId;
    if (!userId) return;
    const graceMs = Number(process.env.POKER_DISCONNECT_GRACE_MS ?? "15000");
    for (const roomId of socket.data.joinedRooms ?? []) {
      const key = `${roomId}:${userId}`;
      const existing = this.disconnectTimers.get(key);
      if (existing) clearTimeout(existing);
      const deadlineAt = new Date(
        Date.now() +
          (Number.isFinite(graceMs) && graceMs >= 0 ? graceMs : 15_000),
      );
      await this.repository.setGrace({ roomId, userId, deadlineAt });
      const timer = setTimeout(
        () => {
          void (async () => {
            const sockets = await this.server.in(roomId).fetchSockets();
            const reconnected = sockets.some(
              (candidate) =>
                (candidate.data as { identity?: SocketIdentity }).identity
                  ?.userId === userId,
            );
            if (!reconnected) {
              await this.performAutomaticAction(roomId, userId).catch(() =>
                this.repository.setDraining(roomId),
              );
            }
            this.disconnectTimers.delete(key);
          })();
        },
        Math.max(0, deadlineAt.getTime() - Date.now()),
      );
      this.disconnectTimers.set(key, timer);
    }
  }

  private armDisconnectGrace(
    roomId: string,
    userId: string,
    deadlineAt: Date,
  ): void {
    const key = `${roomId}:${userId}`;
    const existing = this.disconnectTimers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(
      () => {
        void this.performAutomaticAction(roomId, userId)
          .catch(() => this.repository.setDraining(roomId))
          .finally(() => this.disconnectTimers.delete(key));
      },
      Math.max(0, deadlineAt.getTime() - Date.now()),
    );
    this.disconnectTimers.set(key, timer);
  }

  private async armRecoveredGrace(
    roomId: string,
    runtime: TableRuntime,
  ): Promise<void> {
    const grace = await this.repository.findGrace(
      roomId,
      runtime.state.actorId,
    );
    if (grace) {
      this.armDisconnectGrace(roomId, runtime.state.actorId, grace.deadlineAt);
    }
  }

  private async identity(socket: PokerSocket): Promise<SocketIdentity | null> {
    if (!socket.data.tokenHash) return null;
    return findActiveGuestSession(socket.data.tokenHash, new Date());
  }

  private failure(socket: PokerSocket, error: string, version?: number) {
    const problem: LocalizedProblem = socketProblem(error);
    const result = {
      ok: false as const,
      ...problem,
      ...(version === undefined ? {} : { version }),
    };
    socket.emit("table:error", result);
    return result;
  }

  private broadcastEvents(
    roomId: string,
    handId: string,
    version: number,
    events: readonly { type: string }[],
  ): void {
    for (const event of events) {
      this.server.to(roomId).emit("table:event", { handId, version, event });
    }
  }

  private settleIfComplete(
    state: TableState,
    events: readonly GameEvent[],
  ): {
    state: TableState;
    events: readonly { type: string; [key: string]: unknown }[];
  } {
    if (state.phase !== "complete") return { state, events };
    const settled = settleShowdown(state);
    assertInvariants(settled);
    const stackBefore = new Map(
      state.players.map((player) => [player.id, player.stack]),
    );
    const awards = Object.fromEntries(
      settled.players
        .map(
          (player) =>
            [
              player.id,
              player.stack - (stackBefore.get(player.id) ?? 0),
            ] as const,
        )
        .filter(([, amount]) => amount > 0),
    );
    return {
      state: settled,
      events: [
        ...events,
        {
          type: "hand-settled",
          pot: state.players.reduce(
            (sum, player) => sum + player.handCommitted,
            0,
          ),
          awards,
          stacks: Object.fromEntries(
            settled.players.map((player) => [player.id, player.stack]),
          ),
        },
      ],
    };
  }

  private actionPayloadHash(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private actionDeadline(timeoutSeconds: number): Date {
    const scale = Number(process.env.POKER_TIMEOUT_SCALE ?? "1");
    return new Date(
      Date.now() +
        timeoutSeconds *
          1_000 *
          (Number.isFinite(scale) && scale > 0 ? scale : 1),
    );
  }

  private scheduleTimeout(roomId: string, deadlineAt: Date): void {
    const runtime = this.runtimes.get(roomId);
    if (!runtime || runtime.state.phase === "complete") return;
    if (runtime.actionTimer) clearTimeout(runtime.actionTimer);
    runtime.actionDeadlineAt = deadlineAt;
    const expected = {
      handId: runtime.state.handId,
      version: runtime.state.version,
      actorId: runtime.state.actorId,
      deadlineMs: deadlineAt.getTime(),
    };
    const delay = Math.max(0, deadlineAt.getTime() - Date.now());
    runtime.actionTimer = setTimeout(() => {
      void this.performAutomaticAction(roomId, undefined, expected).catch(() =>
        this.repository.setDraining(roomId),
      );
    }, delay);
  }

  private async performAutomaticAction(
    roomId: string,
    requiredUserId?: string,
    expected?: {
      handId: string;
      version: number;
      actorId: string;
      deadlineMs: number;
    },
  ): Promise<void> {
    await this.runtimes.withLock(roomId, async () => {
      const current = await this.recovery.recover(roomId);
      if (!current || current.state.phase === "complete") return;
      if (
        expected &&
        (current.state.handId !== expected.handId ||
          current.state.version !== expected.version ||
          current.state.actorId !== expected.actorId ||
          current.actionDeadlineAt?.getTime() !== expected.deadlineMs)
      )
        return;
      const actorUserId = current.state.actorId;
      if (requiredUserId && requiredUserId !== actorUserId) return;
      const type = legalActions(current.state, actorUserId).some(
        (action) => action.type === "check",
      )
        ? ("check" as const)
        : ("fold" as const);
      const actionId = `server:timeout:${current.state.handId}:${current.state.version}`;
      const payloadHash = this.actionPayloadHash({ type, actorUserId });
      const existing = await this.repository.findOperation(actionId);
      if (existing) {
        if (
          existing.type !== "ACTION" ||
          existing.roomId !== roomId ||
          existing.handId !== current.state.handId ||
          existing.userId !== actorUserId ||
          existing.payloadHash !== payloadHash
        )
          throw new Error("ACTION_ID_CONFLICT");
        return;
      }
      const result = applyCommandResult(current.state, {
        type,
        playerId: actorUserId,
        expectedVersion: current.state.version,
      });
      if (!result.ok) return;
      const finalized = this.settleIfComplete(
        result.transition.state,
        result.transition.events,
      );
      const room = await this.repository.findRoom(roomId);
      if (!room || room.status === "DRAINING") return;
      const actionDeadlineAt =
        finalized.state.phase === "complete"
          ? null
          : this.actionDeadline(room.actionTimeoutSeconds);
      const ack = {
        ok: true as const,
        actionId,
        version: finalized.state.version,
        events: finalized.events,
        automatic: true,
      };
      await this.repository.commitAction({
        roomId,
        handId: current.state.handId,
        actionId,
        actorUserId,
        payloadHash,
        expectedVersion: current.state.version,
        newVersion: finalized.state.version,
        actionDeadlineAt,
        events: finalized.events.map((event) => ({
          type: event.type,
          payload: event,
        })),
        state: encryptTableState(this.auditKey, finalized.state),
        ack,
        seatStacks: finalized.state.players.map((player) => ({
          userId: player.id,
          stack: BigInt(player.stack),
        })),
      });
      current.state = finalized.state;
      current.actionDeadlineAt = actionDeadlineAt;
      this.broadcastEvents(
        roomId,
        current.state.handId,
        current.state.version,
        finalized.events,
      );
      await this.repository.clearGrace(roomId, actorUserId);
      if (actionDeadlineAt) {
        this.scheduleTimeout(roomId, actionDeadlineAt);
      }
    });
  }

  @SubscribeMessage("table:join")
  async join(
    @ConnectedSocket() socket: PokerSocket,
    @MessageBody() raw: unknown,
  ) {
    const parsed = TableJoinSchema.safeParse(raw);
    if (!parsed.success) return this.failure(socket, "INVALID_JOIN");
    const identity = await this.identity(socket);
    if (!identity) return this.failure(socket, "UNAUTHENTICATED");
    const input = parsed.data;
    return this.runtimes.withLock(input.roomId, async () => {
      const room = await this.repository.findRoom(input.roomId);
      if (!room) return this.failure(socket, "ROOM_NOT_FOUND");
      if (room.status === "DRAINING")
        return this.failure(socket, "ROOM_DRAINING");
      const recovery = await this.recovery.recoverResult(input.roomId);
      if (recovery.kind === "DRAINED") {
        return this.failure(socket, "ROOM_DRAINING");
      }
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
      await this.repository.clearGrace(input.roomId, identity.userId);

      let runtime = recovery.kind === "READY" ? recovery.runtime : null;
      if (recovery.kind === "NO_HAND") {
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
          assertInvariants(state);
          const actionDeadlineAt = this.actionDeadline(
            room.actionTimeoutSeconds,
          );
          await this.repository.createHand({
            roomId: input.roomId,
            handId,
            state: encryptTableState(this.auditKey, state),
            encryptedAudit: encryptDeckAudit(this.auditKey, audit),
            seatStacks: state.players.map((player) => ({
              userId: player.id,
              stack: BigInt(player.stack),
            })),
            actionDeadlineAt,
          });
          runtime = { state, actionDeadlineAt };
          this.runtimes.set(input.roomId, runtime);
          this.server.to(input.roomId).emit("table:snapshot", {
            handId,
            version: state.version,
          });
          this.scheduleTimeout(input.roomId, actionDeadlineAt);
        }
      }
      if (runtime?.actionDeadlineAt && runtime.state.phase !== "complete") {
        this.scheduleTimeout(input.roomId, runtime.actionDeadlineAt);
        await this.armRecoveredGrace(input.roomId, runtime);
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
    const payloadHash = this.actionPayloadHash(action);
    const existing = await this.repository.findOperation(action.actionId);
    if (existing) {
      if (
        existing.type !== "ACTION" ||
        existing.roomId !== action.roomId ||
        existing.handId !== action.handId ||
        existing.userId !== identity.userId ||
        existing.payloadHash !== payloadHash
      ) {
        return this.failure(socket, "ACTION_ID_CONFLICT");
      }
      return existing.ack;
    }
    return this.runtimes.withLock(action.roomId, async () => {
      const committedOperation = await this.repository.findOperation(
        action.actionId,
      );
      if (committedOperation) {
        if (
          committedOperation.type !== "ACTION" ||
          committedOperation.roomId !== action.roomId ||
          committedOperation.handId !== action.handId ||
          committedOperation.userId !== identity.userId ||
          committedOperation.payloadHash !== payloadHash
        )
          return this.failure(socket, "ACTION_ID_CONFLICT");
        return committedOperation.ack;
      }
      const room = await this.repository.findRoom(action.roomId);
      if (!room) return this.failure(socket, "ROOM_NOT_FOUND");
      if (room.status === "DRAINING")
        return this.failure(socket, "ROOM_DRAINING");
      const seats = await this.repository.listSeats(action.roomId);
      if (!seats.some((seat) => seat.userId === identity.userId)) {
        return this.failure(socket, "NOT_SEAT_OWNER");
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
      const finalized = this.settleIfComplete(
        result.transition.state,
        result.transition.events,
      );
      const actionDeadlineAt =
        finalized.state.phase === "complete"
          ? null
          : this.actionDeadline(room.actionTimeoutSeconds);
      const ack = {
        ok: true as const,
        actionId: action.actionId,
        version: finalized.state.version,
        events: finalized.events,
      };
      let committed;
      try {
        committed = await this.repository.commitAction({
          roomId: action.roomId,
          handId: action.handId,
          actionId: action.actionId,
          actorUserId: identity.userId,
          payloadHash,
          expectedVersion: action.expectedVersion,
          newVersion: finalized.state.version,
          actionDeadlineAt,
          events: finalized.events.map((event) => ({
            type: event.type,
            payload: event,
          })),
          state: encryptTableState(this.auditKey, finalized.state),
          ack,
          seatStacks: finalized.state.players.map((player) => ({
            userId: player.id,
            stack: BigInt(player.stack),
          })),
        });
      } catch (error) {
        if (error instanceof Error && error.message === "ACTION_ID_CONFLICT") {
          return this.failure(socket, "ACTION_ID_CONFLICT");
        }
        throw error;
      }
      if (!committed.committed) return committed.ack;
      runtime.state = finalized.state;
      runtime.actionDeadlineAt = actionDeadlineAt;
      this.broadcastEvents(
        action.roomId,
        action.handId,
        runtime.state.version,
        finalized.events,
      );
      if (actionDeadlineAt)
        this.scheduleTimeout(action.roomId, actionDeadlineAt);
      const disconnected = await this.repository.findGrace(
        action.roomId,
        runtime.state.actorId,
      );
      if (disconnected && disconnected.deadlineAt <= new Date()) {
        const disconnectedActorId = runtime.state.actorId;
        setTimeout(
          () =>
            void this.performAutomaticAction(
              action.roomId,
              disconnectedActorId,
            ),
          0,
        );
      }
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
    const request = TableLeaveSchema.safeParse(raw);
    if (!request.success) return this.failure(socket, "INVALID_LEAVE");
    const roomId = request.data.roomId;
    const payloadHash = this.actionPayloadHash(request.data);
    const existing = await this.repository.findOperation(request.data.actionId);
    if (existing) {
      if (
        existing.roomId !== roomId ||
        existing.userId !== identity.userId ||
        existing.type !== "LEAVE" ||
        existing.payloadHash !== payloadHash
      )
        return this.failure(socket, "ACTION_ID_CONFLICT");
      return existing.ack;
    }
    return this.runtimes.withLock(roomId, async () => {
      const committedOperation = await this.repository.findOperation(
        request.data.actionId,
      );
      if (committedOperation) {
        if (
          committedOperation.roomId !== roomId ||
          committedOperation.userId !== identity.userId ||
          committedOperation.type !== "LEAVE" ||
          committedOperation.payloadHash !== payloadHash
        )
          return this.failure(socket, "ACTION_ID_CONFLICT");
        return committedOperation.ack;
      }
      const room = await this.repository.findRoom(roomId);
      if (room?.status === "DRAINING")
        return this.failure(socket, "ROOM_DRAINING");
      const runtime = await this.recovery.recover(roomId);
      if (runtime && runtime.state.phase !== "complete") {
        return this.failure(socket, "HAND_IN_PROGRESS", runtime.state.version);
      }
      try {
        const operation = await this.repository.releaseSeat({
          roomId,
          userId: identity.userId,
          actionId: request.data.actionId,
          payloadHash,
        });
        if (operation.committed) {
          this.server.to(roomId).emit("table:leave", operation.ack);
          await socket.leave(roomId);
          socket.data.joinedRooms?.delete(roomId);
        }
        return operation.ack;
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
    const request = TableRoomRequestSchema.safeParse(raw);
    if (!request.success)
      return this.failure(socket, "INVALID_SNAPSHOT_REQUEST");
    const room = await this.repository.findRoom(request.data.roomId);
    if (room?.status === "DRAINING")
      return this.failure(socket, "ROOM_DRAINING");
    const runtime = await this.recovery.recover(request.data.roomId);
    if (runtime?.actionDeadlineAt && runtime.state.phase !== "complete") {
      this.scheduleTimeout(request.data.roomId, runtime.actionDeadlineAt);
      await this.armRecoveredGrace(request.data.roomId, runtime);
    }
    return runtime
      ? {
          ok: true as const,
          snapshot: playerView(runtime.state, identity.userId),
        }
      : this.failure(socket, "HAND_NOT_FOUND");
  }
}
