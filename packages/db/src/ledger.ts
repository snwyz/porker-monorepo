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

export function isLedgerReferenceUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    modelName?: unknown;
    meta?: { modelName?: unknown; target?: unknown };
  };
  if (candidate.code !== "P2002") {
    return false;
  }

  const modelName = candidate.meta?.modelName ?? candidate.modelName;
  const target = candidate.meta?.target;
  const targetsReference = Array.isArray(target)
    ? target.length === 1 && target[0] === "reference"
    : typeof target === "string" &&
      (target === "reference" || target.includes("reference"));

  return modelName === "LedgerTransaction" && targetsReference;
}

function normalizeEntries(
  entries: readonly LedgerEntryInput[],
): LedgerEntryInput[] {
  const amountsByAccount = new Map<string, bigint>();
  for (const { accountId, amount } of entries) {
    amountsByAccount.set(
      accountId,
      (amountsByAccount.get(accountId) ?? 0n) + amount,
    );
  }

  return [...amountsByAccount]
    .filter(([, amount]) => amount !== 0n)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([accountId, amount]) => ({ accountId, amount }));
}

async function hashEntries(
  entries: readonly LedgerEntryInput[],
): Promise<string> {
  const canonical = JSON.stringify(
    normalizeEntries(entries).map(({ accountId, amount }) => [
      accountId,
      amount.toString(),
    ]),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function assertMatchingPayload(
  transaction: PostedTransaction,
  payloadHash: string,
): PostedTransaction {
  if (transaction.payloadHash !== payloadHash) {
    throw new Error("IDEMPOTENCY_CONFLICT");
  }

  return transaction;
}

async function readByReference(
  reference: string,
  payloadHash: string,
): Promise<PostedTransaction> {
  const existing = await prisma.ledgerTransaction.findUnique({
    where: { reference },
    include: transactionWithEntries,
  });

  if (!existing) {
    throw new Error("IDEMPOTENCY_LOOKUP_FAILED");
  }

  return assertMatchingPayload(existing, payloadHash);
}

async function postTransactionWithSource(
  input: PostTransactionInput,
  sourceAccountId?: string,
): Promise<PostedTransaction> {
  const entries = normalizeEntries(input.entries);
  if (entries.reduce((sum, entry) => sum + entry.amount, 0n) !== 0n) {
    throw new Error("UNBALANCED_TRANSACTION");
  }
  const payloadHash = await hashEntries(entries);

  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (database) => {
          const existing = await database.ledgerTransaction.findUnique({
            where: { reference: input.reference },
            include: transactionWithEntries,
          });
          if (existing) {
            return assertMatchingPayload(existing, payloadHash);
          }

          await Promise.all(
            [...new Set(entries.map(({ accountId }) => accountId))].map((id) =>
              database.ledgerAccount.upsert({
                where: { id },
                create: { id },
                update: {},
              }),
            ),
          );

          if (sourceAccountId) {
            const source = await database.ledgerEntry.aggregate({
              where: { accountId: sourceAccountId },
              _sum: { amount: true },
            });
            const debit = entries.find(
              ({ accountId }) => accountId === sourceAccountId,
            )?.amount;
            if (
              debit === undefined ||
              debit >= 0n ||
              (source._sum.amount ?? 0n) < -debit
            ) {
              throw new Error("INSUFFICIENT_FUNDS");
            }
          }

          return database.ledgerTransaction.create({
            data: {
              reference: input.reference,
              payloadHash,
              entries: {
                create: entries.map(({ accountId, amount }) => ({
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
      if (isLedgerReferenceUniqueConflict(error)) {
        return readByReference(input.reference, payloadHash);
      }

      if (isPrismaError(error, "P2034")) {
        if (attempt < MAX_SERIALIZABLE_ATTEMPTS) {
          continue;
        }
        throw new Error("SERIALIZABLE_TRANSACTION_RETRIES_EXHAUSTED", {
          cause: error,
        });
      }

      throw error;
    }
  }

  throw new Error("SERIALIZABLE_TRANSACTION_RETRIES_EXHAUSTED");
}

export function postTransaction(
  input: PostTransactionInput,
): Promise<PostedTransaction> {
  return postTransactionWithSource(input);
}

export async function getBalance(accountId: string): Promise<bigint> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { accountId },
    _sum: { amount: true },
  });

  return result._sum.amount ?? 0n;
}

function assertPositiveTransferAmount(amount: bigint): void {
  if (amount <= 0n) {
    throw new Error("INVALID_TRANSFER_AMOUNT");
  }
}

export async function reserveBuyIn(
  input: TransferInput,
): Promise<PostedTransaction> {
  assertPositiveTransferAmount(input.amount);
  return postTransactionWithSource(
    {
      reference: input.reference,
      entries: [
        { accountId: input.playerAccountId, amount: -input.amount },
        { accountId: input.tableAccountId, amount: input.amount },
      ],
    },
    input.playerAccountId,
  );
}

export async function settleCashOut(
  input: TransferInput,
): Promise<PostedTransaction> {
  assertPositiveTransferAmount(input.amount);
  return postTransactionWithSource(
    {
      reference: input.reference,
      entries: [
        { accountId: input.tableAccountId, amount: -input.amount },
        { accountId: input.playerAccountId, amount: input.amount },
      ],
    },
    input.tableAccountId,
  );
}
