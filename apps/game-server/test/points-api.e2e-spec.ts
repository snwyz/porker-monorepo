import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/main.js";
import { prisma as database } from "../../../packages/db/src/client.js";

async function clearDatabase(): Promise<void> {
  await database.session.deleteMany();
  await database.room.deleteMany();
  await database.user.deleteMany();
}

function sessionCookie(response: request.Response): string {
  const header = response.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header[0] : header;
  if (!cookie) throw new Error("Missing session cookie");
  return cookie.split(";", 1)[0] as string;
}

describe("points mode HTTP API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.APP_MODE = "points";
    await clearDatabase();
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await clearDatabase();
    await database.$disconnect();
  });

  it("creates one guest and grants points exactly once", async () => {
    const first = await request(app.getHttpServer())
      .post("/v1/guest-session")
      .send({ nickname: "RiverFox" })
      .expect(201);

    expect(first.headers["set-cookie"]?.[0]).toContain("poker_session=");
    expect(first.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(first.headers["set-cookie"]?.[0]).toContain("Secure");
    expect(first.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
    expect(first.body).toMatchObject({ nickname: "RiverFox", points: "10000" });

    const rawToken = sessionCookie(first).slice("poker_session=".length);
    const stored = await database.session.findFirstOrThrow({
      include: { user: true },
    });
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const second = await request(app.getHttpServer())
      .post("/v1/guest-session")
      .set("Cookie", sessionCookie(first))
      .send({ nickname: "IgnoredName" })
      .expect(201);

    expect(second.body).toEqual(first.body);
    expect(await database.user.count()).toBe(1);
    expect(await database.session.count()).toBe(1);
    expect(
      await database.ledgerTransaction.count({
        where: { reference: `guest-grant:${stored.userId}` },
      }),
    ).toBe(1);
    const balance = await database.ledgerEntry.aggregate({
      where: { accountId: `points:${stored.userId}` },
      _sum: { amount: true },
    });
    expect(balance._sum.amount).toBe(10_000n);
  });

  it("rejects a duplicate nickname for a different session", async () => {
    await request(app.getHttpServer())
      .post("/v1/guest-session")
      .send({ nickname: "RiverFox" })
      .expect(409);
  });

  it.each(["ab", "has space", "punctuation!", "a".repeat(25)])(
    "rejects invalid nickname %j",
    async (nickname) => {
      await request(app.getHttpServer())
        .post("/v1/guest-session")
        .send({ nickname })
        .expect(400);
    },
  );

  it("reports the validated app capabilities", async () => {
    process.env.APP_MODE = "unsupported";
    try {
      await request(app.getHttpServer())
        .get("/v1/capabilities")
        .expect(200)
        .expect({ mode: "points" });
    } finally {
      process.env.APP_MODE = "points";
    }
  });

  it("creates and lists a public cash room", async () => {
    const input = {
      name: "Low Stakes",
      seats: 6,
      smallBlind: 25,
      bigBlind: 50,
      minBuyIn: 1_000,
      maxBuyIn: 5_000,
      actionTimeoutSeconds: 30,
    };
    const created = await request(app.getHttpServer())
      .post("/v1/rooms")
      .send(input)
      .expect(201);

    expect(created.body).toMatchObject({
      ...input,
      smallBlind: "25",
      bigBlind: "50",
      minBuyIn: "1000",
      maxBuyIn: "5000",
      visibility: "PUBLIC",
      gameType: "CASH",
    });
    const persisted = await database.room.findUniqueOrThrow({
      where: { id: created.body.id as string },
    });
    expect(persisted.visibility).toBe("PUBLIC");
    expect(persisted.gameType).toBe("CASH");
    expect(persisted.seatCount).toBe(6);

    const listed = await request(app.getHttpServer())
      .get("/v1/rooms")
      .expect(200);
    expect(listed.body).toEqual([created.body]);
  });

  it.each([
    { seats: 1 },
    { seats: 10 },
    { smallBlind: 50, bigBlind: 50 },
    { bigBlind: 1_001, minBuyIn: 1_000 },
    { minBuyIn: 5_001, maxBuyIn: 5_000 },
    { actionTimeoutSeconds: 9 },
    { actionTimeoutSeconds: 121 },
  ])("rejects invalid room configuration %j", async (override) => {
    await request(app.getHttpServer())
      .post("/v1/rooms")
      .send({
        name: "Invalid Room",
        seats: 6,
        smallBlind: 25,
        bigBlind: 50,
        minBuyIn: 1_000,
        maxBuyIn: 5_000,
        actionTimeoutSeconds: 30,
        ...override,
      })
      .expect(400);
  });
});

describe("startup configuration", () => {
  it("refuses to start with an unsupported APP_MODE", async () => {
    process.env.APP_MODE = "unsupported";
    await expect(createApp()).rejects.toThrow();
  });
});
