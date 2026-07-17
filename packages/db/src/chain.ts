import { Prisma } from "@prisma/client";

import { prisma } from "./client.js";
import { postTransactionInDatabase } from "./ledger.js";

export interface ChainCheckpointRecord {
  chainId: bigint;
  blockNumber: bigint;
  blockHash: string;
}

export interface ChainDepositInput {
  id: string;
  chainId: bigint;
  transactionHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  walletAddress: string;
  amount: bigint;
  treasuryAccountId: string;
  escrowAccountId: string;
}

const MAX_ATTEMPTS = 5;
const CHAIN_LOCK_TIMEOUT_MS = 120_000;

function retryable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export function withChainIndexerLock<T>(
  chainId: bigint,
  operation: () => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (database) => {
      await database.$executeRaw`SELECT pg_advisory_xact_lock(${chainId}::bigint)`;
      return operation();
    },
    { maxWait: CHAIN_LOCK_TIMEOUT_MS, timeout: CHAIN_LOCK_TIMEOUT_MS },
  );
}

export function readChainCheckpoint(
  chainId: bigint,
): Promise<ChainCheckpointRecord | null> {
  return prisma.chainCheckpoint.findUnique({ where: { chainId } });
}

export function listChainCheckpointHistory(
  chainId: bigint,
  belowBlock: bigint,
): Promise<ChainCheckpointRecord[]> {
  return prisma.chainCheckpointHistory.findMany({
    where: { chainId, blockNumber: { lt: belowBlock } },
    orderBy: { blockNumber: Prisma.SortOrder.desc },
    select: { chainId: true, blockNumber: true, blockHash: true },
  });
}

export async function storeChainCheckpoint(
  input: ChainCheckpointRecord,
): Promise<ChainCheckpointRecord> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          const current = await database.chainCheckpoint.findUnique({
            where: { chainId: input.chainId },
          });
          if (current && current.blockNumber > input.blockNumber)
            return current;
          await database.chainCheckpointHistory.upsert({
            where: {
              chainId_blockNumber: {
                chainId: input.chainId,
                blockNumber: input.blockNumber,
              },
            },
            create: input,
            update: { blockHash: input.blockHash },
          });
          return database.chainCheckpoint.upsert({
            where: { chainId: input.chainId },
            create: input,
            update: {
              blockNumber: input.blockNumber,
              blockHash: input.blockHash,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!retryable(error) || attempt === MAX_ATTEMPTS) throw error;
      const current = await prisma.chainCheckpoint.findUnique({
        where: { chainId: input.chainId },
      });
      if (current && current.blockNumber >= input.blockNumber) {
        return current;
      }
    }
  }
  throw new Error("CHAIN_CHECKPOINT_RETRIES_EXHAUSTED");
}

export async function creditChainDeposit(input: ChainDepositInput) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          const existing = await database.chainDepositEvent.findUnique({
            where: { id: input.id },
          });
          if (existing && existing.status !== "REORGED") return existing;

          const user = await database.user.findUnique({
            where: { walletAddress: input.walletAddress },
            select: { id: true },
          });
          if (!user && !existing) {
            return database.chainDepositEvent.create({
              data: {
                ...input,
                treasuryAccountId: undefined,
                escrowAccountId: undefined,
                status: "UNATTRIBUTED",
              },
            });
          }

          if (!user && existing) {
            return database.chainDepositEvent.update({
              where: { id: input.id },
              data: {
                blockNumber: input.blockNumber,
                blockHash: input.blockHash,
                amount: input.amount,
                status: "UNATTRIBUTED",
              },
            });
          }

          const revision = existing?.revision ?? 0;
          const transaction = await postTransactionInDatabase(database, {
            reference: `chain-deposit:${input.id}:${revision}`,
            entries: [
              { accountId: input.treasuryAccountId, amount: -input.amount },
              { accountId: input.escrowAccountId, amount: input.amount },
            ],
          });
          const eventData = {
            id: input.id,
            chainId: input.chainId,
            transactionHash: input.transactionHash,
            logIndex: input.logIndex,
            blockNumber: input.blockNumber,
            blockHash: input.blockHash,
            walletAddress: input.walletAddress,
            amount: input.amount,
            status: "CREDITED",
            userId: user!.id,
            ledgerTransactionId: transaction.id,
          };
          return existing
            ? database.chainDepositEvent.update({
                where: { id: input.id },
                data: eventData,
              })
            : database.chainDepositEvent.create({ data: eventData });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!retryable(error) || attempt === MAX_ATTEMPTS) throw error;
      const existing = await prisma.chainDepositEvent.findUnique({
        where: { id: input.id },
      });
      if (existing && existing.status !== "REORGED") return existing;
    }
  }
  throw new Error("CHAIN_DEPOSIT_RETRIES_EXHAUSTED");
}

export async function rewindChainDeposits(input: {
  chainId: bigint;
  fromBlock: bigint;
  checkpoint: ChainCheckpointRecord | null;
}): Promise<void> {
  await prisma.$transaction(
    async (database) => {
      const affected = await database.chainDepositEvent.findMany({
        where: {
          chainId: input.chainId,
          blockNumber: { gte: input.fromBlock },
          status: { in: ["CREDITED", "UNATTRIBUTED"] },
        },
        include: {
          ledgerTransaction: { include: { entries: true } },
        },
      });
      for (const event of affected) {
        if (event.ledgerTransaction) {
          await postTransactionInDatabase(database, {
            reference: `chain-deposit-reversal:${event.id}:${event.revision}`,
            entries: event.ledgerTransaction.entries.map((entry) => ({
              accountId: entry.accountId,
              amount: -entry.amount,
            })),
          });
        }
        await database.chainDepositEvent.update({
          where: { id: event.id },
          data: {
            status: "REORGED",
            revision: { increment: 1 },
            ledgerTransactionId: null,
          },
        });
      }
      await database.chainCheckpointHistory.deleteMany({
        where: {
          chainId: input.chainId,
          blockNumber: { gte: input.fromBlock },
        },
      });
      if (input.checkpoint) {
        await database.chainCheckpointHistory.upsert({
          where: {
            chainId_blockNumber: {
              chainId: input.checkpoint.chainId,
              blockNumber: input.checkpoint.blockNumber,
            },
          },
          create: input.checkpoint,
          update: { blockHash: input.checkpoint.blockHash },
        });
        await database.chainCheckpoint.upsert({
          where: { chainId: input.chainId },
          create: input.checkpoint,
          update: {
            blockNumber: input.checkpoint.blockNumber,
            blockHash: input.checkpoint.blockHash,
          },
        });
      } else {
        await database.chainCheckpoint.deleteMany({
          where: { chainId: input.chainId },
        });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
