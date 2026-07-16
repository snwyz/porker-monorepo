import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "./client.js";
import {
  getBalance,
  postTransaction,
  reserveBuyIn,
  settleCashOut,
} from "./ledger.js";

describe("PostgreSQL ledger", () => {
  beforeEach(async () => {
    await prisma.ledgerEntry.deleteMany();
    await prisma.ledgerTransaction.deleteMany();
    await prisma.ledgerAccount.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("posts a balanced grant once", async () => {
    const input = {
      reference: "grant:user-1",
      entries: [
        { accountId: "points:treasury", amount: -10_000n },
        { accountId: "points:user-1", amount: 10_000n },
      ],
    };

    await postTransaction(input);
    await postTransaction(input);

    expect(await getBalance("points:user-1")).toBe(10_000n);
  });

  it("rejects an unbalanced transaction without writing entries", async () => {
    await expect(
      postTransaction({
        reference: "broken:user-1",
        entries: [{ accountId: "points:user-1", amount: 100n }],
      }),
    ).rejects.toThrow("UNBALANCED_TRANSACTION");

    expect(await getBalance("points:user-1")).toBe(0n);
  });

  it("returns one transaction for concurrent duplicate references", async () => {
    const input = {
      reference: "grant:concurrent-user",
      entries: [
        { accountId: "points:treasury", amount: -750n },
        { accountId: "points:concurrent-user", amount: 750n },
      ],
    };

    const transactions = await Promise.all(
      Array.from({ length: 8 }, () => postTransaction(input)),
    );

    expect(new Set(transactions.map(({ id }) => id))).toHaveLength(1);
    expect(await getBalance("points:concurrent-user")).toBe(750n);
  });

  it("reserves a buy-in and settles a cash-out through balanced entries", async () => {
    await postTransaction({
      reference: "grant:player",
      entries: [
        { accountId: "points:treasury", amount: -5_000n },
        { accountId: "points:player", amount: 5_000n },
      ],
    });

    await reserveBuyIn({
      reference: "buy-in:seat-1",
      playerAccountId: "points:player",
      tableAccountId: "chips:room-1",
      amount: 2_000n,
    });
    await settleCashOut({
      reference: "cash-out:seat-1",
      playerAccountId: "points:player",
      tableAccountId: "chips:room-1",
      amount: 2_500n,
    });

    expect(await getBalance("points:player")).toBe(5_500n);
    expect(await getBalance("chips:room-1")).toBe(-500n);
  });
});
