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
    await prisma.seat.deleteMany();
    await prisma.room.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$queryRaw`SELECT reset_ledger_for_test()`;
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

  it("treats entry order as incidental for an idempotent reference", async () => {
    const first = await postTransaction({
      reference: "grant:order-independent",
      entries: [
        { accountId: "points:treasury", amount: -100n },
        { accountId: "points:ordered-user", amount: 100n },
      ],
    });
    const second = await postTransaction({
      reference: "grant:order-independent",
      entries: [
        { accountId: "points:ordered-user", amount: 100n },
        { accountId: "points:treasury", amount: -100n },
      ],
    });

    expect(second.id).toBe(first.id);
  });

  it("rejects sequential reuse of a reference with different entries", async () => {
    await postTransaction({
      reference: "grant:sequential-conflict",
      entries: [
        { accountId: "points:treasury", amount: -100n },
        { accountId: "points:conflict-user", amount: 100n },
      ],
    });

    await expect(
      postTransaction({
        reference: "grant:sequential-conflict",
        entries: [
          { accountId: "points:treasury", amount: -200n },
          { accountId: "points:conflict-user", amount: 200n },
        ],
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await getBalance("points:conflict-user")).toBe(100n);
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

  it("prevents direct SQL updates to posted entries", async () => {
    const transaction = await postTransaction({
      reference: "grant:immutable-update",
      entries: [
        { accountId: "points:treasury", amount: -100n },
        { accountId: "points:immutable-update", amount: 100n },
      ],
    });

    await expect(
      prisma.$executeRaw`UPDATE "LedgerEntry" SET "amount" = "amount" + 1 WHERE "transactionId" = ${transaction.id}`,
    ).rejects.toThrow("POSTED_LEDGER_IMMUTABLE");
  });

  it("prevents direct SQL deletes of posted entries", async () => {
    const transaction = await postTransaction({
      reference: "grant:immutable-delete",
      entries: [
        { accountId: "points:treasury", amount: -100n },
        { accountId: "points:immutable-delete", amount: 100n },
      ],
    });

    await expect(
      prisma.$executeRaw`DELETE FROM "LedgerEntry" WHERE "transactionId" = ${transaction.id}`,
    ).rejects.toThrow("POSTED_LEDGER_IMMUTABLE");
  });

  it("prevents direct SQL from committing an unbalanced posting", async () => {
    await expect(
      prisma.$transaction(async (database) => {
        await database.ledgerAccount.create({
          data: { id: "points:direct-unbalanced" },
        });
        const transaction = await database.ledgerTransaction.create({
          data: {
            reference: "direct:unbalanced",
            payloadHash: "direct-unbalanced",
          },
        });
        await database.ledgerEntry.create({
          data: {
            transactionId: transaction.id,
            accountId: "points:direct-unbalanced",
            amount: 1n,
          },
        });
      }),
    ).rejects.toThrow("UNBALANCED_LEDGER_TRANSACTION");
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

  it("rejects one concurrent caller when a reference has different entries", async () => {
    const results = await Promise.allSettled([
      postTransaction({
        reference: "grant:concurrent-conflict",
        entries: [
          { accountId: "points:treasury", amount: -300n },
          { accountId: "points:concurrent-conflict", amount: 300n },
        ],
      }),
      postTransaction({
        reference: "grant:concurrent-conflict",
        entries: [
          { accountId: "points:treasury", amount: -400n },
          { accountId: "points:concurrent-conflict", amount: 400n },
        ],
      }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const rejection = results.find(({ status }) => status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "IDEMPOTENCY_CONFLICT" }),
    });
    expect([300n, 400n]).toContain(
      await getBalance("points:concurrent-conflict"),
    );
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
      amount: 1_500n,
    });

    expect(await getBalance("points:player")).toBe(4_500n);
    expect(await getBalance("chips:room-1")).toBe(500n);
  });

  it("rejects zero and negative transfer amounts", async () => {
    for (const amount of [0n, -1n]) {
      await expect(
        reserveBuyIn({
          reference: `invalid-buy-in:${amount}`,
          playerAccountId: "points:player",
          tableAccountId: "chips:room-1",
          amount,
        }),
      ).rejects.toThrow("INVALID_TRANSFER_AMOUNT");
    }
  });

  it("rejects a buy-in or cash-out that would overdraw its source", async () => {
    await postTransaction({
      reference: "grant:limited-player",
      entries: [
        { accountId: "points:treasury", amount: -500n },
        { accountId: "points:limited-player", amount: 500n },
      ],
    });

    await expect(
      reserveBuyIn({
        reference: "buy-in:overdraft",
        playerAccountId: "points:limited-player",
        tableAccountId: "chips:limited-room",
        amount: 501n,
      }),
    ).rejects.toThrow("INSUFFICIENT_FUNDS");
    await expect(
      settleCashOut({
        reference: "cash-out:overdraft",
        playerAccountId: "points:limited-player",
        tableAccountId: "chips:limited-room",
        amount: 1n,
      }),
    ).rejects.toThrow("INSUFFICIENT_FUNDS");
  });

  it("serializes concurrent buy-ins so the player cannot double-spend", async () => {
    await postTransaction({
      reference: "grant:double-spend-player",
      entries: [
        { accountId: "points:treasury", amount: -1_000n },
        { accountId: "points:double-spend-player", amount: 1_000n },
      ],
    });

    const results = await Promise.allSettled([
      reserveBuyIn({
        reference: "buy-in:double-spend-a",
        playerAccountId: "points:double-spend-player",
        tableAccountId: "chips:room-a",
        amount: 800n,
      }),
      reserveBuyIn({
        reference: "buy-in:double-spend-b",
        playerAccountId: "points:double-spend-player",
        tableAccountId: "chips:room-b",
        amount: 800n,
      }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "INSUFFICIENT_FUNDS" }),
    });
    expect(await getBalance("points:double-spend-player")).toBe(200n);
  });

  it("enforces public cash rooms with a seat count from two through nine", async () => {
    const insertRoom = (
      id: string,
      visibility: string,
      gameType: string,
      seatCount: number,
    ) =>
      prisma.$executeRaw`
        INSERT INTO "Room" (
          "id", "name", "status", "visibility", "gameType", "seatCount",
          "smallBlind", "bigBlind", "minBuyIn", "maxBuyIn", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${id}, 'WAITING', ${visibility}, ${gameType}, ${seatCount},
          1, 2, 40, 200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;

    await expect(
      insertRoom("private-room", "PRIVATE", "CASH", 6),
    ).rejects.toThrow("Room_visibility_check");
    await expect(
      insertRoom("tournament-room", "PUBLIC", "TOURNAMENT", 6),
    ).rejects.toThrow("Room_gameType_check");
    await expect(insertRoom("tiny-room", "PUBLIC", "CASH", 1)).rejects.toThrow(
      "Room_seatCount_check",
    );
    await expect(insertRoom("huge-room", "PUBLIC", "CASH", 10)).rejects.toThrow(
      "Room_seatCount_check",
    );
    await expect(insertRoom("valid-room", "PUBLIC", "CASH", 9)).resolves.toBe(
      1,
    );
  });

  it("keeps zero-based seat indexes inside the configured room capacity", async () => {
    await prisma.$executeRaw`
      INSERT INTO "Room" (
        "id", "name", "status", "visibility", "gameType", "seatCount",
        "smallBlind", "bigBlind", "minBuyIn", "maxBuyIn", "createdAt", "updatedAt"
      ) VALUES (
        'capacity-room', 'capacity-room', 'WAITING', 'PUBLIC', 'CASH', 2,
        1, 2, 40, 200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;

    await expect(
      prisma.$executeRaw`
        INSERT INTO "Seat" (
          "id", "roomId", "seatNumber", "status", "stack", "buyIn", "createdAt", "updatedAt"
        ) VALUES (
          'seat-outside-capacity', 'capacity-room', 2, 'OPEN', 0, 0,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toThrow("SEAT_INDEX_OUT_OF_RANGE");
  });

  it("does not shrink a room below an occupied seat index", async () => {
    await prisma.$executeRaw`
      INSERT INTO "Room" (
        "id", "name", "status", "visibility", "gameType", "seatCount",
        "smallBlind", "bigBlind", "minBuyIn", "maxBuyIn", "createdAt", "updatedAt"
      ) VALUES (
        'shrinking-room', 'shrinking-room', 'WAITING', 'PUBLIC', 'CASH', 3,
        1, 2, 40, 200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;
    await prisma.seat.create({
      data: {
        id: "high-occupied-seat",
        roomId: "shrinking-room",
        seatNumber: 2,
      },
    });

    await expect(
      prisma.$executeRaw`UPDATE "Room" SET "seatCount" = 2 WHERE "id" = 'shrinking-room'`,
    ).rejects.toThrow("ROOM_CAPACITY_BELOW_EXISTING_SEAT");
  });

  it("allows a user to occupy only one seat in a room", async () => {
    await prisma.$executeRaw`
      INSERT INTO "Room" (
        "id", "name", "status", "visibility", "gameType", "seatCount",
        "smallBlind", "bigBlind", "minBuyIn", "maxBuyIn", "createdAt", "updatedAt"
      ) VALUES (
        'unique-seat-room', 'unique-seat-room', 'WAITING', 'PUBLIC', 'CASH', 2,
        1, 2, 40, 200, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `;
    await prisma.user.create({
      data: { id: "unique-seat-user", displayName: "Unique Seat User" },
    });
    await prisma.seat.create({
      data: {
        id: "unique-seat-a",
        roomId: "unique-seat-room",
        userId: "unique-seat-user",
        seatNumber: 0,
      },
    });

    await expect(
      prisma.seat.create({
        data: {
          id: "unique-seat-b",
          roomId: "unique-seat-room",
          userId: "unique-seat-user",
          seatNumber: 1,
        },
      }),
    ).rejects.toThrow("Unique constraint failed");
  });
});
