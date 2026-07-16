import { beforeEach, describe, expect, it } from "vitest";

import * as publicDatabaseApi from "./index.js";
import { prisma } from "./client.js";

interface AtomicGuestCreator {
  createGuestWithGrant(input: {
    displayName: string;
    tokenHash: string;
    expiresAt: Date;
    grantAmount: bigint;
  }): Promise<{ id: string; displayName: string }>;
}

describe("atomic guest provisioning", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$queryRaw`SELECT reset_ledger_for_test()`;
  });

  it("rolls back the user, session, and nickname when the grant fails", async () => {
    const createGuestWithGrant = (
      publicDatabaseApi as unknown as AtomicGuestCreator
    ).createGuestWithGrant;
    const input = {
      displayName: "AtomicFox",
      tokenHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
      grantAmount: 0n,
    };

    await expect(createGuestWithGrant(input)).rejects.toThrow(
      "INVALID_GUEST_GRANT_AMOUNT",
    );
    expect(
      await prisma.user.count({ where: { displayName: input.displayName } }),
    ).toBe(0);
    expect(await prisma.session.count()).toBe(0);
    expect(
      await prisma.ledgerTransaction.count({
        where: { reference: { startsWith: "guest-grant:" } },
      }),
    ).toBe(0);

    await expect(
      createGuestWithGrant({ ...input, grantAmount: 10_000n }),
    ).resolves.toMatchObject({ displayName: input.displayName });
  });
});
