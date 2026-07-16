import { Prisma } from "@prisma/client";

import { prisma } from "./client.js";
import { postTransactionInDatabase } from "./ledger.js";

const MAX_SERIALIZABLE_ATTEMPTS = 5;
const GUEST_GRANT_AMOUNT = 10_000n;

export interface ActiveGuestSession {
  userId: string;
  displayName: string;
}

export interface PublicRoomRecord {
  id: string;
  name: string;
  seatCount: number;
  smallBlind: bigint;
  bigBlind: bigint;
  minBuyIn: bigint;
  maxBuyIn: bigint;
  actionTimeoutSeconds: number;
  status: string;
}

export interface TableSeatRecord {
  userId: string;
  displayName: string;
  seatNumber: number;
  stack: bigint;
}

export interface DurableTableSnapshot {
  roomId: string;
  handId: string;
  version: number;
  state: unknown;
  actionDeadlineAt: Date | null;
  handStatus: string;
  handRoomId: string;
}

export interface DurableHandEvent {
  sequence: number;
  version: number;
  type: string;
  payload: unknown;
  actionId: string | null;
}

export interface DurableActionAck {
  roomId: string;
  handId: string;
  actionId: string;
  actorUserId: string;
  payloadHash: string;
  ack: unknown;
  committed: boolean;
}

export async function findActiveGuestSession(
  tokenHash: string,
  now: Date,
): Promise<ActiveGuestSession | null> {
  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    include: { user: true },
  });
  return session
    ? { userId: session.userId, displayName: session.user.displayName }
    : null;
}

export async function createGuestWithGrant(input: {
  displayName: string;
  tokenHash: string;
  expiresAt: Date;
  grantAmount: bigint;
}): Promise<{ id: string; displayName: string }> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          const user = await database.user.create({
            data: {
              displayName: input.displayName,
              sessions: {
                create: {
                  tokenHash: input.tokenHash,
                  expiresAt: input.expiresAt,
                },
              },
            },
            select: { id: true, displayName: true },
          });
          if (input.grantAmount !== GUEST_GRANT_AMOUNT) {
            throw new Error("INVALID_GUEST_GRANT_AMOUNT");
          }
          await postTransactionInDatabase(database, {
            reference: `guest-grant:${user.id}`,
            entries: [
              { accountId: "points:treasury", amount: -input.grantAmount },
              {
                accountId: `points:${user.id}`,
                amount: input.grantAmount,
              },
            ],
          });
          return user;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < MAX_SERIALIZABLE_ATTEMPTS
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("SERIALIZABLE_TRANSACTION_RETRIES_EXHAUSTED");
}

export async function createPublicRoom(input: {
  name: string;
  seatCount: number;
  smallBlind: bigint;
  bigBlind: bigint;
  minBuyIn: bigint;
  maxBuyIn: bigint;
  actionTimeoutSeconds: number;
}): Promise<PublicRoomRecord> {
  return prisma.room.create({
    data: {
      ...input,
      visibility: "PUBLIC",
      gameType: "CASH",
    },
    select: {
      id: true,
      name: true,
      seatCount: true,
      smallBlind: true,
      bigBlind: true,
      minBuyIn: true,
      maxBuyIn: true,
      actionTimeoutSeconds: true,
      status: true,
    },
  });
}

export function listPublicRooms(): Promise<PublicRoomRecord[]> {
  return prisma.room.findMany({
    where: { visibility: "PUBLIC", gameType: "CASH" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      seatCount: true,
      smallBlind: true,
      bigBlind: true,
      minBuyIn: true,
      maxBuyIn: true,
      actionTimeoutSeconds: true,
      status: true,
    },
  });
}

export async function claimTableSeat(input: {
  roomId: string;
  userId: string;
  seatNumber: number;
  buyIn: bigint;
}): Promise<TableSeatRecord> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          const room = await database.room.findUniqueOrThrow({
            where: { id: input.roomId },
          });
          if (room.status === "DRAINING") throw new Error("ROOM_DRAINING");
          if (
            input.seatNumber < 0 ||
            input.seatNumber >= room.seatCount ||
            input.buyIn < room.minBuyIn ||
            input.buyIn > room.maxBuyIn
          ) {
            throw new Error("INVALID_SEAT_OR_BUY_IN");
          }
          const existing = await database.seat.findFirst({
            where: { roomId: input.roomId, userId: input.userId },
            include: { user: true },
          });
          if (existing) {
            if (existing.seatNumber !== input.seatNumber) {
              throw new Error("SEAT_OWNERSHIP_CONFLICT");
            }
            return {
              userId: input.userId,
              displayName: existing.user?.displayName ?? "",
              seatNumber: existing.seatNumber,
              stack: existing.stack,
            };
          }

          await postTransactionInDatabase(
            database,
            {
              reference: `buy-in:${input.roomId}:${input.userId}`,
              entries: [
                { accountId: `points:${input.userId}`, amount: -input.buyIn },
                { accountId: `table:${input.roomId}`, amount: input.buyIn },
              ],
            },
            `points:${input.userId}`,
          );
          const seat = await database.seat.create({
            data: {
              roomId: input.roomId,
              userId: input.userId,
              seatNumber: input.seatNumber,
              status: "SEATED",
              stack: input.buyIn,
              buyIn: input.buyIn,
            },
            include: { user: true },
          });
          return {
            userId: input.userId,
            displayName: seat.user?.displayName ?? "",
            seatNumber: seat.seatNumber,
            stack: seat.stack,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < MAX_SERIALIZABLE_ATTEMPTS
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("SERIALIZABLE_TRANSACTION_RETRIES_EXHAUSTED");
}

export async function listTableSeats(
  roomId: string,
): Promise<TableSeatRecord[]> {
  const seats = await prisma.seat.findMany({
    where: { roomId, status: "SEATED", userId: { not: null } },
    include: { user: true },
    orderBy: { seatNumber: "asc" },
  });
  return seats.map((seat) => ({
    userId: seat.userId!,
    displayName: seat.user?.displayName ?? "",
    seatNumber: seat.seatNumber,
    stack: seat.stack,
  }));
}

export async function createDurableHand(input: {
  roomId: string;
  handId: string;
  state: unknown;
  encryptedAudit: string;
  seatStacks: readonly { userId: string; stack: bigint }[];
  actionDeadlineAt: Date;
}): Promise<DurableTableSnapshot> {
  return prisma.$transaction(async (database) => {
    const latest = await database.hand.findFirst({
      where: { roomId: input.roomId },
      orderBy: { handNumber: "desc" },
      select: { handNumber: true },
    });
    await database.hand.create({
      data: {
        id: input.handId,
        roomId: input.roomId,
        handNumber: (latest?.handNumber ?? 0n) + 1n,
        actionDeadlineAt: input.actionDeadlineAt,
      },
    });
    const state = input.state as Prisma.InputJsonValue;
    await database.gameSnapshot.create({
      data: { roomId: input.roomId, handId: input.handId, version: 0n, state },
    });
    await database.auditLog.create({
      data: {
        action: "HAND_DECK_ENCRYPTED",
        targetType: "Hand",
        targetId: input.handId,
        metadata: { ciphertext: input.encryptedAudit },
      },
    });
    for (const seat of input.seatStacks) {
      if (seat.stack < 0n) throw new Error("INVALID_SEAT_STACK");
      await database.seat.updateMany({
        where: { roomId: input.roomId, userId: seat.userId },
        data: { stack: seat.stack },
      });
    }
    return {
      roomId: input.roomId,
      handId: input.handId,
      version: 0,
      state,
      actionDeadlineAt: input.actionDeadlineAt,
      handStatus: "IN_PROGRESS",
      handRoomId: input.roomId,
    };
  });
}

export async function loadLatestTableSnapshot(
  roomId: string,
): Promise<DurableTableSnapshot | null> {
  const snapshot = await prisma.gameSnapshot.findFirst({
    where: { roomId },
    orderBy: { id: "desc" },
    include: {
      hand: { select: { actionDeadlineAt: true, status: true, roomId: true } },
    },
  });
  return snapshot
    ? {
        roomId: snapshot.roomId,
        handId: snapshot.handId,
        version: Number(snapshot.version),
        state: snapshot.state,
        actionDeadlineAt: snapshot.hand.actionDeadlineAt,
        handStatus: snapshot.hand.status,
        handRoomId: snapshot.hand.roomId,
      }
    : null;
}

export async function loadHandEventsAfter(
  handId: string,
  sequence: number,
): Promise<DurableHandEvent[]> {
  const events = await prisma.handEvent.findMany({
    where: { handId, sequence: { gt: sequence } },
    orderBy: { sequence: "asc" },
  });
  return events.map((event) => ({
    sequence: event.sequence,
    version: event.version,
    type: event.type,
    payload: event.payload,
    actionId: event.actionId,
  }));
}

export async function loadHandEventsSinceVersion(
  handId: string,
  version: number,
): Promise<DurableHandEvent[]> {
  const events = await prisma.handEvent.findMany({
    where: { handId, version: { gt: version } },
    orderBy: { sequence: "asc" },
  });
  return events.map((event) => ({
    sequence: event.sequence,
    version: event.version,
    type: event.type,
    payload: event.payload,
    actionId: event.actionId,
  }));
}

export async function findCommittedAction(
  actionId: string,
): Promise<DurableActionAck | null> {
  const operation = await prisma.tableOperation.findUnique({
    where: { actionId },
  });
  return operation?.type === "ACTION" && operation.handId
    ? {
        handId: operation.handId,
        actionId: operation.actionId,
        actorUserId: operation.userId,
        roomId: operation.roomId,
        payloadHash: operation.payloadHash,
        ack: operation.ack,
        committed: false,
      }
    : null;
}

export async function commitDurableAction(input: {
  roomId: string;
  handId: string;
  actionId: string;
  actorUserId: string;
  payloadHash: string;
  expectedVersion: number;
  events: readonly { type: string; payload: unknown }[];
  state: unknown;
  ack: unknown;
  seatStacks: readonly { userId: string; stack: bigint }[];
  newVersion: number;
  actionDeadlineAt: Date | null;
}): Promise<DurableActionAck> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          const existing = await database.tableOperation.findUnique({
            where: { actionId: input.actionId },
          });
          if (existing) {
            if (
              existing.type !== "ACTION" ||
              existing.handId !== input.handId ||
              existing.userId !== input.actorUserId ||
              existing.roomId !== input.roomId ||
              existing.payloadHash !== input.payloadHash
            )
              throw new Error("ACTION_ID_CONFLICT");
            return {
              roomId: existing.roomId,
              handId: existing.handId,
              actionId: input.actionId,
              actorUserId: existing.userId,
              payloadHash: existing.payloadHash,
              ack: existing.ack,
              committed: false,
            };
          }
          const snapshot = await database.gameSnapshot.findFirst({
            where: { roomId: input.roomId, handId: input.handId },
            orderBy: { version: "desc" },
          });
          if (!snapshot || Number(snapshot.version) !== input.expectedVersion) {
            throw new Error("STALE_VERSION");
          }
          await database.tableOperation.create({
            data: {
              actionId: input.actionId,
              roomId: input.roomId,
              userId: input.actorUserId,
              type: "ACTION",
              handId: input.handId,
              payloadHash: input.payloadHash,
              ack: input.ack as Prisma.InputJsonValue,
            },
          });
          const last = await database.handEvent.findFirst({
            where: { handId: input.handId },
            orderBy: { sequence: "desc" },
          });
          let sequence = last?.sequence ?? 0;
          for (const [index, event] of input.events.entries()) {
            sequence += 1;
            await database.handEvent.create({
              data: {
                handId: input.handId,
                sequence,
                version: input.newVersion,
                type: event.type,
                payload: event.payload as Prisma.InputJsonValue,
                actionId: index === 0 ? input.actionId : null,
                actorUserId: index === 0 ? input.actorUserId : null,
                actionRoomId: index === 0 ? input.roomId : null,
                actionPayloadHash: index === 0 ? input.payloadHash : null,
                ack:
                  index === 0
                    ? (input.ack as Prisma.InputJsonValue)
                    : undefined,
              },
            });
          }
          await database.gameSnapshot.create({
            data: {
              roomId: input.roomId,
              handId: input.handId,
              version: BigInt(input.newVersion),
              state: input.state as Prisma.InputJsonValue,
            },
          });
          for (const seat of input.seatStacks) {
            if (seat.stack < 0n) throw new Error("INVALID_SEAT_STACK");
            await database.seat.updateMany({
              where: { roomId: input.roomId, userId: seat.userId },
              data: { stack: seat.stack },
            });
          }
          await database.hand.update({
            where: { id: input.handId },
            data: {
              actionDeadlineAt: input.actionDeadlineAt,
              ...(input.actionDeadlineAt === null
                ? { status: "COMPLETE", completedAt: new Date() }
                : {}),
            },
          });
          return {
            roomId: input.roomId,
            handId: input.handId,
            actionId: input.actionId,
            actorUserId: input.actorUserId,
            payloadHash: input.payloadHash,
            ack: input.ack,
            committed: true,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < MAX_SERIALIZABLE_ATTEMPTS
      ) {
        continue;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await findTableOperation(input.actionId);
        if (
          existing &&
          existing.type === "ACTION" &&
          existing.roomId === input.roomId &&
          existing.handId === input.handId &&
          existing.userId === input.actorUserId &&
          existing.payloadHash === input.payloadHash
        )
          return {
            roomId: existing.roomId,
            handId: input.handId,
            actionId: existing.actionId,
            actorUserId: existing.userId,
            payloadHash: existing.payloadHash,
            ack: existing.ack,
            committed: false,
          };
        if (existing) throw new Error("ACTION_ID_CONFLICT", { cause: error });
      }
      throw error;
    }
  }
  throw new Error("SERIALIZABLE_TRANSACTION_RETRIES_EXHAUSTED");
}

export async function releaseTableSeat(input: {
  roomId: string;
  userId: string;
  actionId: string;
  payloadHash: string;
}): Promise<{ ack: unknown; committed: boolean }> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          const operation = await database.tableOperation.findUnique({
            where: { actionId: input.actionId },
          });
          if (operation) {
            if (
              operation.roomId !== input.roomId ||
              operation.userId !== input.userId ||
              operation.type !== "LEAVE" ||
              operation.payloadHash !== input.payloadHash
            )
              throw new Error("ACTION_ID_CONFLICT");
            return { ack: operation.ack, committed: false };
          }
          const seat = await database.seat.findFirst({
            where: { roomId: input.roomId, userId: input.userId },
          });
          if (!seat) throw new Error("NOT_SEAT_OWNER");
          if (seat.stack > 0n) {
            await postTransactionInDatabase(
              database,
              {
                reference: `cash-out:${seat.id}`,
                entries: [
                  { accountId: `table:${input.roomId}`, amount: -seat.stack },
                  { accountId: `points:${input.userId}`, amount: seat.stack },
                ],
              },
              `table:${input.roomId}`,
            );
          }
          const ack = {
            ok: true,
            userId: input.userId,
            cashOut: seat.stack.toString(),
          };
          await database.tableOperation.create({
            data: {
              actionId: input.actionId,
              roomId: input.roomId,
              userId: input.userId,
              type: "LEAVE",
              payloadHash: input.payloadHash,
              ack,
            },
          });
          await database.seat.delete({ where: { id: seat.id } });
          return { ack, committed: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2034" && attempt < MAX_SERIALIZABLE_ATTEMPTS)
          continue;
        if (error.code === "P2002") {
          const operation = await findTableOperation(input.actionId);
          if (
            operation?.roomId === input.roomId &&
            operation.userId === input.userId &&
            operation.type === "LEAVE" &&
            operation.payloadHash === input.payloadHash
          )
            return { ack: operation.ack, committed: false };
          if (operation)
            throw new Error("ACTION_ID_CONFLICT", { cause: error });
          if (attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
        }
      }
      throw error;
    }
  }
  throw new Error("SERIALIZABLE_TRANSACTION_RETRIES_EXHAUSTED");
}

export function findTableOperation(actionId: string) {
  return prisma.tableOperation.findUnique({ where: { actionId } });
}

export async function setDisconnectGrace(input: {
  roomId: string;
  userId: string;
  deadlineAt: Date;
}): Promise<void> {
  await prisma.disconnectGrace.upsert({
    where: { roomId_userId: { roomId: input.roomId, userId: input.userId } },
    create: input,
    update: { deadlineAt: input.deadlineAt },
  });
}

export async function clearDisconnectGrace(
  roomId: string,
  userId: string,
): Promise<void> {
  await prisma.disconnectGrace.deleteMany({ where: { roomId, userId } });
}

export async function findDisconnectGrace(roomId: string, userId: string) {
  return prisma.disconnectGrace.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
}

export async function setRoomDraining(roomId: string): Promise<void> {
  await prisma.room.update({
    where: { id: roomId },
    data: { status: "DRAINING" },
  });
}

export async function listActiveRecoveryRoomIds(): Promise<string[]> {
  const hands = await prisma.hand.findMany({
    where: { status: "IN_PROGRESS", room: { status: { not: "DRAINING" } } },
    distinct: ["roomId"],
    select: { roomId: true },
  });
  return hands.map(({ roomId }) => roomId);
}
