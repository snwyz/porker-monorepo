import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma as database } from "../../../packages/db/src/client.js";
import { createApp } from "../src/main.js";

const DOMAIN = "poker.test";
const URI = "https://poker.test";
const CHAIN_ID = 84_532;
const account = privateKeyToAccount(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const attacker = privateKeyToAccount(
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
);

interface NonceResponse {
  nonce: string;
  expiresAt: string;
}

interface MessageOptions {
  address?: string;
  nonce: string;
  domain?: string;
  uri?: string;
  chainId?: number;
  issuedAt?: Date;
  expirationTime?: Date;
}

function loginMessage(options: MessageOptions): string {
  const issuedAt = options.issuedAt ?? new Date();
  const expirationTime =
    options.expirationTime ?? new Date(issuedAt.getTime() + 5 * 60_000);
  return `${options.domain ?? DOMAIN} wants you to sign in with your Ethereum account:
${options.address ?? account.address}

Sign in to Poker

URI: ${options.uri ?? URI}
Version: 1
Chain ID: ${options.chainId ?? CHAIN_ID}
Nonce: ${options.nonce}
Issued At: ${issuedAt.toISOString()}
Expiration Time: ${expirationTime.toISOString()}`;
}

function cookie(response: request.Response): string {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Missing session cookie");
  return value;
}

describe("wallet signed login", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.APP_MODE = "web3";
    process.env.WALLET_LOGIN_DOMAIN = DOMAIN;
    process.env.WALLET_LOGIN_URI = URI;
    process.env.CHAIN_RPC_URL = "http://127.0.0.1:1";
    process.env.ESCROW_ADDRESS = account.address;
    process.env.CHAIN_POLL_INTERVAL_MS = "60000";
    app = await createApp();
    await app.init();
  });

  beforeEach(async () => {
    await database.walletNonce.deleteMany();
    await database.session.deleteMany();
    await database.user.deleteMany();
  });

  afterAll(async () => {
    await database.walletNonce.deleteMany();
    await database.session.deleteMany();
    await database.user.deleteMany();
    await app.close();
  });

  async function issue(address = account.address): Promise<NonceResponse> {
    const response = await request(app.getHttpServer())
      .post("/v1/wallet/nonce")
      .send({ address })
      .expect(201);
    return response.body as NonceResponse;
  }

  async function signedVerify(
    message: string,
    signer = account,
  ): Promise<request.Response> {
    const signature = await signer.signMessage({ message });
    return request(app.getHttpServer())
      .post("/v1/wallet/verify")
      .send({ message, signature });
  }

  it("issues a persisted opaque nonce and creates a secure opaque session", async () => {
    const issued = await issue();
    expect(issued.nonce).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const storedNonce = await database.walletNonce.findFirstOrThrow();
    expect(storedNonce.nonceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedNonce.nonceHash).not.toContain(issued.nonce);
    expect(storedNonce.address).toBe(account.address.toLowerCase());
    expect(storedNonce.consumedAt).toBeNull();

    const message = loginMessage({
      nonce: issued.nonce,
      expirationTime: new Date(issued.expiresAt),
    });
    const response = await signedVerify(message);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ address: account.address });
    expect(cookie(response)).toContain("poker_session=");
    expect(cookie(response)).toContain("HttpOnly");
    expect(cookie(response)).toContain("Secure");
    expect(cookie(response)).toContain("SameSite=Lax");
    expect(cookie(response)).toContain("Max-Age=2592000");

    const rawToken = cookie(response)
      .split(";", 1)[0]!
      .slice("poker_session=".length);
    const session = await database.session.findFirstOrThrow({
      include: { user: true },
    });
    expect(session.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.tokenHash).not.toBe(rawToken);
    expect(session.user.walletAddress).toBe(account.address.toLowerCase());
    expect(
      (await database.walletNonce.findFirstOrThrow()).consumedAt,
    ).not.toBeNull();
  });

  it("reuses the wallet user while creating a fresh session", async () => {
    const first = await issue();
    await signedVerify(
      loginMessage({
        nonce: first.nonce,
        expirationTime: new Date(first.expiresAt),
      }),
    ).then((response) => expect(response.status).toBe(201));
    const second = await issue();
    await signedVerify(
      loginMessage({
        nonce: second.nonce,
        expirationTime: new Date(second.expiresAt),
      }),
    ).then((response) => expect(response.status).toBe(201));
    expect(await database.user.count()).toBe(1);
    expect(await database.session.count()).toBe(2);
  });

  it("atomically rejects replay and concurrent double-spend", async () => {
    const issued = await issue();
    const message = loginMessage({
      nonce: issued.nonce,
      expirationTime: new Date(issued.expiresAt),
    });
    const signature = await account.signMessage({ message });
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app.getHttpServer())
          .post("/v1/wallet/verify")
          .send({ message, signature }),
      ),
    );
    expect(results.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(results.filter(({ body }) => body.code === "P000181")).toHaveLength(
      5,
    );
    expect(await database.session.count()).toBe(1);
  });

  it.each([
    ["domain", { domain: "evil.test" }, "P000181"],
    ["URI", { uri: "https://evil.test" }, "P000181"],
    ["chain", { chainId: 1 }, "P000181"],
  ] as const)(
    "rejects the wrong %s before consuming the nonce",
    async (_label, changes, code) => {
      const issued = await issue();
      const message = loginMessage({
        nonce: issued.nonce,
        expirationTime: new Date(issued.expiresAt),
        ...changes,
      });
      const response = await signedVerify(message);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe(code);
      expect(
        (await database.walletNonce.findFirstOrThrow()).consumedAt,
      ).toBeNull();
    },
  );

  it("rejects a signature made by the wrong address", async () => {
    const issued = await issue();
    const response = await signedVerify(
      loginMessage({
        nonce: issued.nonce,
        expirationTime: new Date(issued.expiresAt),
      }),
      attacker,
    );
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("P000181");
  });

  it("binds the issued nonce to its requested address", async () => {
    const issued = await issue(account.address);
    const response = await signedVerify(
      loginMessage({
        address: attacker.address,
        nonce: issued.nonce,
        expirationTime: new Date(issued.expiresAt),
      }),
      attacker,
    );
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("P000181");
    expect(
      (await database.walletNonce.findFirstOrThrow()).consumedAt,
    ).toBeNull();
  });

  it.each([
    ["future", 2 * 60_000, "P000181"],
    ["too old", -11 * 60_000, "P000181"],
  ] as const)(
    "rejects an issued-at timestamp in the %s",
    async (_label, offset, code) => {
      const issued = await issue();
      const issuedAt = new Date(Date.now() + offset);
      const response = await signedVerify(
        loginMessage({
          nonce: issued.nonce,
          issuedAt,
          expirationTime: new Date(issued.expiresAt),
        }),
      );
      expect(response.status).toBe(401);
      expect(response.body.code).toBe(code);
    },
  );

  it("rejects an expired signed message and an expired persisted nonce", async () => {
    const issued = await issue();
    const expiredMessage = loginMessage({
      nonce: issued.nonce,
      issuedAt: new Date(Date.now() - 2 * 60_000),
      expirationTime: new Date(Date.now() - 60_000),
    });
    const expiredResponse = await signedVerify(expiredMessage);
    expect(expiredResponse.status).toBe(401);
    expect(expiredResponse.body.code).toBe("P000181");

    await database.walletNonce.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const response = await signedVerify(
      loginMessage({
        nonce: issued.nonce,
        expirationTime: new Date(Date.now() + 60_000),
      }),
    );
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("P000181");
  });

  it.each([
    ["malformed message", "not a login message", `0x${"11".repeat(65)}`],
    ["malformed signature", "MESSAGE", "0x1234"],
  ])(
    "rejects a %s without an internal error",
    async (_label, messageValue, signature) => {
      const issued = await issue();
      const message =
        messageValue === "MESSAGE"
          ? loginMessage({
              nonce: issued.nonce,
              expirationTime: new Date(issued.expiresAt),
            })
          : messageValue;
      const response = await request(app.getHttpServer())
        .post("/v1/wallet/verify")
        .send({ message, signature });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("P000180");
      expect(JSON.stringify(response.body)).not.toContain(issued.nonce);
    },
  );
});

describe("wallet API mode isolation", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.APP_MODE = "points";
    delete process.env.WALLET_LOGIN_DOMAIN;
    delete process.env.WALLET_LOGIN_URI;
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("does not expose wallet endpoints in points mode", async () => {
    await request(app.getHttpServer())
      .post("/v1/wallet/nonce")
      .send({ address: account.address })
      .expect(404);
    await request(app.getHttpServer())
      .post("/v1/wallet/verify")
      .send({ message: "unused", signature: "unused" })
      .expect(404);
  });
});
