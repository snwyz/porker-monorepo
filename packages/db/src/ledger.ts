import { Prisma } from "@prisma/client";

import { prisma } from "./client.js";

export interface LedgerEntryInput {
  accountId: string;
  amount: bigint;
}

export interface PostTransactionInput {
  reference: string;
  entries: readonly LedgerEntryInput[];
}

export interface TransferInput {
  reference: string;
  playerAccountId: string;
  tableAccountId: string;
  amount: bigint;
}

const transactionWithEntries = {
  entries: { orderBy: { id: Prisma.SortOrder.asc } },
} satisfies Prisma.LedgerTransactionInclude;

type PostedTransaction = Prisma.LedgerTransactionGetPayload<{
  include: typeof transactionWithEntries;
}>;

const MAX_SERIALIZABLE_ATTEMPTS = 5;

function isPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

async function readByReference(reference: string): Promise<PostedTransaction> {
  const existing = await prisma.ledgerTransaction.findUnique({
    where: { reference },
    include: transactionWithEntries,
  });

  if (!existing) {
    throw new Error("IDEMPOTENCY_LOOKUP_FAILED");
  }

  return existing;
}

export async function postTransaction(
  input: PostTransactionInput,
): Promise<PostedTransaction> {
  if (input.entries.reduce((sum, entry) => sum + entry.amount, 0n) !== 0n) {
    throw new Error("UNBALANCED_TRANSACTION");
  }

  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          await Promise.all(
            [...new Set(input.entries.map(({ accountId }) => accountId))].map(
              (id) =>
                database.ledgerAccount.upsert({
                  where: { id },
                  create: { id },
                  update: {},
                }),
            ),
          );

          return database.ledgerTransaction.create({
            data: {
              reference: input.reference,
              entries: {
                create: input.entries.map(({ accountId, amount }) => ({
                  accountId,
                  amount,
                })),
              },
            },
            include: transactionWithEntries,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        return readByReference(input.reference);
      }

      if (
        isPrismaError(error, "P2034") &&
        attempt < MAX_SERIALIZABLE_ATTEMPTS
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("SERIALIZABLE_TRANSACTION_RETRIES_EXHAUSTED");
}

export async function getBalance(accountId: string): Promise<bigint> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { accountId },
    _sum: { amount: true },
  });

  return result._sum.amount ?? 0n;
}

export function reserveBuyIn(input: TransferInput): Promise<PostedTransaction> {
  return postTransaction({
    reference: input.reference,
    entries: [
      { accountId: input.playerAccountId, amount: -input.amount },
      { accountId: input.tableAccountId, amount: input.amount },
    ],
  });
}

export function settleCashOut(
  input: TransferInput,
): Promise<PostedTransaction> {
  return postTransaction({
    reference: input.reference,
    entries: [
      { accountId: input.tableAccountId, amount: -input.amount },
      { accountId: input.playerAccountId, amount: input.amount },
    ],
  });
}
