import { Prisma } from "@prisma/client";

import { prisma } from "./client.js";
import { postTransactionInDatabase } from "./ledger.js";

const MAX_ATTEMPTS = 5;

export interface WithdrawalDraft {
  chainId: bigint;
  escrowAddress: string;
  walletAddress: string;
  amount: bigint;
  nonce: bigint;
  deadline: Date;
}

export interface ReserveWithdrawalInput {
  userId: string;
  walletAddress: string;
  chainId: bigint;
  escrowAddress: string;
  amount: bigint;
  deadline: Date;
  idempotencyKey?: string;
}

function retryable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

export async function findActiveWalletSession(tokenHash: string, now: Date) {
  return prisma.session.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: now },
      user: { walletAddress: { not: null } },
    },
    include: { user: true },
  });
}

export async function reserveWithdrawal(
  input: ReserveWithdrawalInput,
  sign: (draft: WithdrawalDraft) => Promise<string>,
) {
  if (input.amount <= 0n) throw new Error("INVALID_WITHDRAWAL_AMOUNT");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          if (input.idempotencyKey) {
            const existing = await database.withdrawal.findUnique({
              where: {
                userId_idempotencyKey: {
                  userId: input.userId,
                  idempotencyKey: input.idempotencyKey,
                },
              },
            });
            if (existing) {
              if (
                existing.amount !== input.amount ||
                existing.chainId !== input.chainId ||
                existing.escrowAddress !== input.escrowAddress
              ) {
                throw new Error("IDEMPOTENCY_CONFLICT");
              }
              return existing;
            }
          }

          const nonceRow = await database.walletWithdrawalNonce.upsert({
            where: {
              chainId_escrowAddress_walletAddress: {
                chainId: input.chainId,
                escrowAddress: input.escrowAddress,
                walletAddress: input.walletAddress,
              },
            },
            create: {
              chainId: input.chainId,
              escrowAddress: input.escrowAddress,
              walletAddress: input.walletAddress,
              nextNonce: 1n,
            },
            update: { nextNonce: { increment: 1n } },
          });
          const nonce = nonceRow.nextNonce - 1n;
          const id = crypto.randomUUID();
          const reservation = await postTransactionInDatabase(
            database,
            {
              reference: `withdrawal-reserve:${id}`,
              entries: [
                {
                  accountId: `escrow:${input.walletAddress}`,
                  amount: -input.amount,
                },
                {
                  accountId: `withdrawal-reserved:${input.walletAddress}`,
                  amount: input.amount,
                },
              ],
            },
            `escrow:${input.walletAddress}`,
          );
          const signature = await sign({ ...input, nonce });
          return database.withdrawal.create({
            data: {
              id,
              userId: input.userId,
              walletAddress: input.walletAddress,
              chainId: input.chainId,
              escrowAddress: input.escrowAddress,
              amount: input.amount,
              nonce,
              deadline: input.deadline,
              signature,
              idempotencyKey: input.idempotencyKey,
              reservationTransactionId: reservation.id,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!retryable(error) || attempt === MAX_ATTEMPTS) throw error;
    }
  }
  throw new Error("WITHDRAWAL_RETRIES_EXHAUSTED");
}

export function findWithdrawalForUser(id: string, userId: string) {
  return prisma.withdrawal.findFirst({ where: { id, userId } });
}

export function listReservedWithdrawals() {
  return prisma.withdrawal.findMany({
    where: { status: "RESERVED" },
    orderBy: { createdAt: Prisma.SortOrder.asc },
  });
}

export async function transitionWithdrawal(
  id: string,
  outcome: "COMPLETED" | "RELEASED",
  chainTransactionHash?: string,
) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          const current = await database.withdrawal.findUnique({
            where: { id },
          });
          if (!current || current.status !== "RESERVED") return current;
          const reference = `withdrawal-${outcome.toLowerCase()}:${id}`;
          const entries =
            outcome === "COMPLETED"
              ? [
                  {
                    accountId: `withdrawal-reserved:${current.walletAddress}`,
                    amount: -current.amount,
                  },
                  {
                    accountId: `treasury:${current.chainId}:${current.escrowAddress}`,
                    amount: current.amount,
                  },
                ]
              : [
                  {
                    accountId: `withdrawal-reserved:${current.walletAddress}`,
                    amount: -current.amount,
                  },
                  {
                    accountId: `escrow:${current.walletAddress}`,
                    amount: current.amount,
                  },
                ];
          const settlement = await postTransactionInDatabase(
            database,
            { reference, entries },
            `withdrawal-reserved:${current.walletAddress}`,
          );
          return database.withdrawal.update({
            where: { id },
            data: {
              status: outcome,
              settlementTransactionId: settlement.id,
              chainTransactionHash,
              completedAt: new Date(),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!retryable(error) || attempt === MAX_ATTEMPTS) throw error;
    }
  }
  throw new Error("WITHDRAWAL_RETRIES_EXHAUSTED");
}
