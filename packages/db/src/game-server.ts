import { prisma } from "./client.js";

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

export async function createGuestSession(input: {
  displayName: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<{ id: string; displayName: string }> {
  return prisma.user.create({
    data: {
      displayName: input.displayName,
      sessions: {
        create: { tokenHash: input.tokenHash, expiresAt: input.expiresAt },
      },
    },
    select: { id: true, displayName: true },
  });
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
