import { Prisma } from "@prisma/client";
import { Client } from "pg";

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

export interface ChainDepositRangeInput {
  deposits: readonly ChainDepositInput[];
  checkpoint: ChainCheckpointRecord;
}

export interface ChainDepositRangeHooks {
  afterFenceLocked?(): Promise<void>;
}

export interface ChainIndexerFence {
  chainId: bigint;
  generation: bigint;
  backendPid: number;
  assertActive(): void;
}

export interface ChainIndexerLockHooks {
  afterBackendIdentified?(backendPid: number): Promise<void>;
}

const MAX_ATTEMPTS = 5;

function retryable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P002002" || error.code === "P002034")
  );
}

function isPostgresConnectionLoss(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = String(error.code);
  return code.startsWith("08") || ["57P000001", "57P000002", "57P000003"].includes(code);
}

export async function withChainIndexerLock<T>(
  chainId: bigint,
  operation: (fence: ChainIndexerFence) => Promise<T>,
  hooks: ChainIndexerLockHooks = {},
): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString });
  let active = true;
  let completed = false;
  let rejectConnectionLoss!: (error: Error) => void;
  const connectionLoss = new Promise<never>((_resolve, reject) => {
    rejectConnectionLoss = reject;
  });
  void connectionLoss.catch(() => undefined);
  const markConnectionLost = (cause: unknown): void => {
    if (!active || completed) return;
    active = false;
    rejectConnectionLoss(new Error("CHAIN_INDEXER_FENCE_LOST", { cause }));
  };
  client.on("error", markConnectionLost);
  client.on("end", () =>
    markConnectionLost(new Error("LOCK_CONNECTION_ENDED")),
  );
  const whileConnected = async <Value>(
    operationPromise: Promise<Value>,
  ): Promise<Value> => {
    try {
      return await Promise.race([operationPromise, connectionLoss]);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "CHAIN_INDEXER_FENCE_LOST"
      ) {
        throw error;
      }
      if (!active || isPostgresConnectionLoss(error)) {
        active = false;
        throw new Error("CHAIN_INDEXER_FENCE_LOST", { cause: error });
      }
      throw error;
    }
  };

  try {
    await whileConnected(client.connect());
    const backend = await whileConnected(
      client.query<{ backendPid: number }>(
        'SELECT pg_backend_pid()::int AS "backendPid"',
      ),
    );
    const backendPid = backend.rows[0]?.backendPid;
    if (backendPid === undefined) throw new Error("LOCK_BACKEND_PID_MISSING");
    if (hooks.afterBackendIdentified) {
      await whileConnected(hooks.afterBackendIdentified(backendPid));
    }
    await whileConnected(
      client.query("SELECT pg_advisory_lock($1::bigint)", [chainId.toString()]),
    );
    const lease = await whileConnected(
      client.query<{ generation: string }>(
        `INSERT INTO "ChainIndexerLease" ("chainId", "generation", "updatedAt")
       VALUES ($1::bigint, 1, NOW())
       ON CONFLICT ("chainId") DO UPDATE
       SET "generation" = "ChainIndexerLease"."generation" + 1,
           "updatedAt" = NOW()
       RETURNING "generation"::text`,
        [chainId.toString()],
      ),
    );
    const generation = lease.rows[0]?.generation;
    if (generation === undefined) throw new Error("LOCK_GENERATION_MISSING");
    const fence: ChainIndexerFence = {
      chainId,
      generation: BigInt(generation),
      backendPid,
      assertActive() {
        if (!active) throw new Error("CHAIN_INDEXER_FENCE_LOST");
      },
    };
    return await whileConnected(operation(fence));
  } finally {
    if (active) {
      await client
        .query("SELECT pg_advisory_unlock($1::bigint)", [chainId.toString()])
        .catch(() => undefined);
    }
    completed = true;
    active = false;
    await client.end().catch(() => undefined);
  }
}

async function assertChainIndexerFence(
  database: Prisma.TransactionClient,
  fence: ChainIndexerFence,
): Promise<void> {
  fence.assertActive();
  const rows = await database.$queryRaw<Array<{ generation: bigint }>>`
    SELECT "generation"
    FROM "ChainIndexerLease"
    WHERE "chainId" = ${fence.chainId}
    FOR SHARE
  `;
  if (rows[0]?.generation !== fence.generation) {
    throw new Error("CHAIN_INDEXER_FENCE_LOST");
  }
  fence.assertActive();
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

async function storeCheckpointInDatabase(
  database: Prisma.TransactionClient,
  input: ChainCheckpointRecord,
) {
  const current = await database.chainCheckpoint.findUnique({
    where: { chainId: input.chainId },
  });
  if (current && current.blockNumber > input.blockNumber) return current;
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
}

export async function storeChainCheckpoint(
  input: ChainCheckpointRecord,
  fence: ChainIndexerFence,
): Promise<ChainCheckpointRecord> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          await assertChainIndexerFence(database, fence);
          return storeCheckpointInDatabase(database, input);
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

async function creditChainDepositInDatabase(
  database: Prisma.TransactionClient,
  input: ChainDepositInput,
) {
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
}

export async function creditChainDeposit(
  input: ChainDepositInput,
  fence: ChainIndexerFence,
) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          await assertChainIndexerFence(database, fence);
          return creditChainDepositInDatabase(database, input);
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

export async function commitChainDepositRange(
  input: ChainDepositRangeInput,
  fence: ChainIndexerFence,
  hooks: ChainDepositRangeHooks = {},
): Promise<ChainCheckpointRecord> {
  let runFenceLockedHook = true;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          await assertChainIndexerFence(database, fence);
          if (runFenceLockedHook && hooks.afterFenceLocked) {
            runFenceLockedHook = false;
            await hooks.afterFenceLocked();
          }
          for (const deposit of input.deposits) {
            await creditChainDepositInDatabase(database, deposit);
          }
          return storeCheckpointInDatabase(database, input.checkpoint);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!retryable(error) || attempt === MAX_ATTEMPTS) throw error;
    }
  }
  throw new Error("CHAIN_DEPOSIT_RANGE_RETRIES_EXHAUSTED");
}

export async function rewindChainDeposits(
  input: {
    chainId: bigint;
    fromBlock: bigint;
    checkpoint: ChainCheckpointRecord | null;
  },
  fence: ChainIndexerFence,
): Promise<void> {
  await prisma.$transaction(
    async (database) => {
      await assertChainIndexerFence(database, fence);
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
