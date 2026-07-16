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
    },
  });
}
