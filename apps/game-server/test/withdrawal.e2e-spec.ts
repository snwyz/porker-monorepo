import type { INestApplication } from "@nestjs/common";
import { createHash } from "node:crypto";
import request from "supertest";
import { getAddress, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { postTransaction } from "@poker/db";
import { prisma as database } from "../../../packages/db/src/client.js";
import { createApp } from "../src/main.js";
import { withdrawalTypedData } from "../src/settlement/operator-signer.js";
import {
  ReconciliationService,
  type ReconciliationClient,
} from "../src/settlement/reconciliation.service.js";

const operatorKey =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const operator = privateKeyToAccount(operatorKey);
const wallet = privateKeyToAccount(
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
);
const otherWallet = privateKeyToAccount(
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
);
const escrow = "0x0000000000000000000000000000000000000001";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fakeClient(
  consumed: boolean,
  timestamp: bigint,
): ReconciliationClient {
  return {
    getChainId: async () => 84_532,
    getBlockNumber: async () => 100n,
    getBlock: async () => ({ timestamp }),
    readContract: async () => consumed,
  } as unknown as ReconciliationClient;
}

describe("withdrawal vouchers", () => {
  let app: INestApplication;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    Object.assign(process.env, {
      APP_MODE: "web3",
      WALLET_LOGIN_DOMAIN: "poker.test",
      WALLET_LOGIN_URI: "https://poker.test",
      CHAIN_ID: "84532",
      CHAIN_RPC_URL: "http://127.0.0.1:1",
      ESCROW_ADDRESS: escrow,
      CHAIN_POLL_INTERVAL_MS: "60000",
      WITHDRAWAL_RECONCILE_INTERVAL_MS: "60000",
      OPERATOR_PRIVATE_KEY: operatorKey,
      OPERATOR_ADDRESS: operator.address,
    });
    app = await createApp();
    await app.init();
  });

  beforeEach(async () => {
    await database.$queryRaw`SELECT reset_ledger_for_test()`;
    await database.walletNonce.deleteMany();
    await database.session.deleteMany();
    await database.user.deleteMany();
    token = crypto.randomUUID().replaceAll("-", "") + "abcd";
    otherToken = crypto.randomUUID().replaceAll("-", "") + "efgh";
    await database.user.create({
      data: {
        displayName: "wallet-a",
        walletAddress: wallet.address.toLowerCase(),
        sessions: {
          create: {
            tokenHash: sha256(token),
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });
    await database.user.create({
      data: {
        displayName: "wallet-b",
        walletAddress: otherWallet.address.toLowerCase(),
        sessions: {
          create: {
            tokenHash: sha256(otherToken),
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });
    await postTransaction({
      reference: `test-credit:${crypto.randomUUID()}`,
      entries: [
        { accountId: `treasury:84532:${escrow}`, amount: -100n },
        { accountId: `escrow:${wallet.address.toLowerCase()}`, amount: 100n },
      ],
    });
  });

  afterAll(async () => {
    await database.$queryRaw`SELECT reset_ledger_for_test()`;
    await database.session.deleteMany();
    await database.user.deleteMany();
    await app.close();
  });

  function post(amount: bigint, session = token, key?: string) {
    const pending = request(app.getHttpServer())
      .post("/v1/withdrawals")
      .set("Cookie", `poker_session=${session}`)
      .send({ amount: amount.toString() });
    return key ? pending.set("Idempotency-Key", key) : pending;
  }

  it("cannot reserve the same escrow balance twice", async () => {
    const results = await Promise.all([post(80n), post(80n)]);
    expect(results.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(
      results.filter(({ body }) => body.code === "INSUFFICIENT_ESCROW"),
    ).toHaveLength(1);
    const balance = await database.ledgerEntry.aggregate({
      where: { accountId: `escrow:${wallet.address.toLowerCase()}` },
      _sum: { amount: true },
    });
    expect(balance._sum.amount).toBe(20n);
    expect(await database.withdrawal.count()).toBe(1);
  });

  it("signs the exact PokerEscrow voucher and allocates increasing wallet nonces", async () => {
    const first = await post(20n).expect(201);
    const second = await post(30n).expect(201);
    expect([first.body.nonce, second.body.nonce]).toEqual(["0", "1"]);
    const typed = withdrawalTypedData({
      chainId: 84_532,
      escrowAddress: getAddress(escrow),
      account: wallet.address,
      amount: 20n,
      nonce: 0n,
      deadline: BigInt(first.body.deadline),
    });
    expect(
      await verifyTypedData({
        ...typed,
        address: operator.address,
        signature: first.body.signature,
      }),
    ).toBe(true);
  });

  it("is idempotent for the same request and rejects key reuse with another amount", async () => {
    const first = await post(40n, token, "same").expect(201);
    const retry = await post(40n, token, "same").expect(201);
    expect(retry.body).toEqual(first.body);
    await post(41n, token, "same")
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe("IDEMPOTENCY_CONFLICT"));
    expect(await database.withdrawal.count()).toBe(1);
  });

  it("requires wallet authentication and enforces withdrawal ownership", async () => {
    await post(1n, "invalid").expect(401);
    const created = await post(10n).expect(201);
    await request(app.getHttpServer())
      .get(`/v1/withdrawals/${created.body.id}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/v1/withdrawals/${created.body.id}`)
      .set("Cookie", `poker_session=${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/v1/withdrawals/${created.body.id}`)
      .set("Cookie", `poker_session=${token}`)
      .expect(200);
  });

  it("completes a consumed voucher once and posts balanced immutable accounting", async () => {
    await post(40n).expect(201);
    const reconciler = app.get(ReconciliationService);
    const concurrentReconciler = new ReconciliationService();
    await Promise.all([
      reconciler.reconcilePending(fakeClient(true, 2_000_000_000n)),
      concurrentReconciler.reconcilePending(fakeClient(true, 2_000_000_000n)),
    ]);
    const withdrawal = await database.withdrawal.findFirstOrThrow();
    expect(withdrawal.status).toBe("COMPLETED");
    expect(await database.ledgerTransaction.count()).toBe(3);
    const reserved = await database.ledgerEntry.aggregate({
      where: {
        accountId: `withdrawal-reserved:${wallet.address.toLowerCase()}`,
      },
      _sum: { amount: true },
    });
    expect(reserved._sum.amount).toBe(0n);
  });

  it("releases only an expired definitely-unconsumed voucher and survives retry", async () => {
    await post(40n).expect(201);
    const row = await database.withdrawal.findFirstOrThrow();
    await database.withdrawal.update({
      where: { id: row.id },
      data: { deadline: new Date(1_000) },
    });
    const reconciler = app.get(ReconciliationService);
    await expect(
      reconciler.reconcilePending({
        getChainId: async () => {
          throw new Error("RPC_DOWN");
        },
      } as unknown as ReconciliationClient),
    ).rejects.toThrow("RPC_DOWN");
    expect(
      (await database.withdrawal.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe("RESERVED");
    await reconciler.reconcilePending(fakeClient(false, 2n));
    expect(
      (await database.withdrawal.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe("RELEASED");
    const available = await database.ledgerEntry.aggregate({
      where: { accountId: `escrow:${wallet.address.toLowerCase()}` },
      _sum: { amount: true },
    });
    expect(available._sum.amount).toBe(100n);
  });

  it("never releases an expired consumed voucher", async () => {
    await post(40n).expect(201);
    const row = await database.withdrawal.findFirstOrThrow();
    await database.withdrawal.update({
      where: { id: row.id },
      data: { deadline: new Date(1_000) },
    });
    await app.get(ReconciliationService).reconcilePending(fakeClient(true, 2n));
    expect(
      (await database.withdrawal.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe("COMPLETED");
  });

  it("fails closed for a signer mismatch without reserving funds", async () => {
    process.env.OPERATOR_ADDRESS = otherWallet.address;
    await post(10n).expect(500);
    process.env.OPERATOR_ADDRESS = operator.address;
    expect(await database.withdrawal.count()).toBe(0);
    const balance = await database.ledgerEntry.aggregate({
      where: { accountId: `escrow:${wallet.address.toLowerCase()}` },
      _sum: { amount: true },
    });
    expect(balance._sum.amount).toBe(100n);
  });

  it("fails closed when the operator key is missing", async () => {
    delete process.env.OPERATOR_PRIVATE_KEY;
    await post(10n).expect(500);
    process.env.OPERATOR_PRIVATE_KEY = operatorKey;
    expect(await database.withdrawal.count()).toBe(0);
  });

  it("does not reconcile against an RPC endpoint for another chain", async () => {
    await post(10n).expect(201);
    await expect(
      app.get(ReconciliationService).reconcilePending({
        getChainId: async () => 1,
      } as unknown as ReconciliationClient),
    ).rejects.toThrow("WITHDRAWAL_CHAIN_ID_MISMATCH");
    expect((await database.withdrawal.findFirstOrThrow()).status).toBe(
      "RESERVED",
    );
  });
});

describe("withdrawal mode isolation", () => {
  it("returns 404 in points mode without Web3 configuration", async () => {
    process.env.APP_MODE = "points";
    delete process.env.OPERATOR_PRIVATE_KEY;
    delete process.env.OPERATOR_ADDRESS;
    delete process.env.CHAIN_RPC_URL;
    delete process.env.ESCROW_ADDRESS;
    const app = await createApp();
    await app.init();
    await request(app.getHttpServer())
      .post("/v1/withdrawals")
      .send({ amount: "1" })
      .expect(404);
    await request(app.getHttpServer())
      .get("/v1/withdrawals/missing")
      .expect(404);
    await app.close();
  });
});
