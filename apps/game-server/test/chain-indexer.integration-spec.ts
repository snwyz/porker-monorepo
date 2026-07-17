import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { prisma as database } from "../../../packages/db/src/client.js";
import { CheckpointRepository } from "../src/chain/checkpoint.repository.js";
import {
  ChainIndexerService,
  type ChainIndexerClient,
} from "../src/chain/indexer.service.js";
import { ChainIndexerRunner } from "../src/chain/indexer.runner.js";
import { Web3LedgerService } from "../src/settlement/web3-ledger.service.js";
import { createApp } from "../src/main.js";

const CHAIN_ID = 84_532;
const RPC_PORT = 18_545;
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;
const ANVIL = new URL("../../../.tools/foundry/bin/anvil", import.meta.url)
  .pathname;
const PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);
const chain = { ...foundry, id: CHAIN_ID } as const;
const tokenAbi = parseAbi([
  "constructor(address admin)",
  "function mint(address account, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const escrowAbi = parseAbi([
  "constructor(address token, address admin, address operator)",
  "function deposit(uint256 amount)",
  "event Deposited(address indexed account, uint256 amount)",
]);

interface Artifact {
  bytecode: { object: `0x${string}` };
}

function artifact(name: string): Artifact {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../../packages/contracts/out/${name}.sol/${name}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as Artifact;
}

async function waitForRpc(client: PublicClient): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await client.getChainId();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Anvil did not start");
}

describe("reorg-safe deposit indexer", () => {
  let anvil: ChildProcess;
  let publicClient: PublicClient;
  let testClient: ReturnType<typeof createTestClient>;
  let walletClient: ReturnType<typeof createWalletClient>;
  let escrowAddress: Address;
  let baselineSnapshot: `0x${string}`;

  const config = () => ({
    chainId: CHAIN_ID,
    escrowAddress,
    rpcUrl: RPC_URL,
    confirmations: 2n,
    rangeSize: 2n,
    startBlock: 0n,
    reorgRewindBlocks: 6n,
  });

  function indexer(
    client: ChainIndexerClient = publicClient,
  ): ChainIndexerService {
    return new ChainIndexerService(
      client,
      config(),
      new CheckpointRepository(),
      new Web3LedgerService(),
    );
  }

  async function mine(count = 1): Promise<void> {
    await testClient.mine({ blocks: count });
  }

  async function deposit(amount: bigint): Promise<`0x${string}`> {
    return walletClient.writeContract({
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "deposit",
      args: [amount],
      account,
      chain,
    });
  }

  async function resetDatabase(): Promise<void> {
    await database.chainDepositEvent.deleteMany();
    await database.$queryRaw`SELECT reset_ledger_for_test()`;
    await database.chainCheckpoint.deleteMany();
    await database.chainCheckpointHistory.deleteMany();
    await database.walletNonce.deleteMany();
    await database.session.deleteMany();
    await database.user.deleteMany();
  }

  beforeAll(async () => {
    anvil = spawn(
      ANVIL,
      ["--port", String(RPC_PORT), "--chain-id", String(CHAIN_ID)],
      {
        stdio: "ignore",
      },
    );
    publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
    testClient = createTestClient({
      chain,
      mode: "anvil",
      transport: http(RPC_URL),
    });
    walletClient = createWalletClient({
      chain,
      transport: http(RPC_URL),
      account,
    });
    await waitForRpc(publicClient);

    const tokenHash = await walletClient.deployContract({
      abi: tokenAbi,
      bytecode: artifact("MockPokerToken").bytecode.object,
      args: [account.address],
      account,
      chain,
    });
    const token = (
      await publicClient.waitForTransactionReceipt({ hash: tokenHash })
    ).contractAddress!;
    const escrowHash = await walletClient.deployContract({
      abi: escrowAbi,
      bytecode: artifact("PokerEscrow").bytecode.object,
      args: [token, account.address, account.address],
      account,
      chain,
    });
    escrowAddress = (
      await publicClient.waitForTransactionReceipt({ hash: escrowHash })
    ).contractAddress!;
    await walletClient.writeContract({
      address: token,
      abi: tokenAbi,
      functionName: "mint",
      args: [account.address, 1_000_000n],
      account,
      chain,
    });
    await walletClient.writeContract({
      address: token,
      abi: tokenAbi,
      functionName: "approve",
      args: [escrowAddress, 1_000_000n],
      account,
      chain,
    });
    await mine(1);
    baselineSnapshot = await testClient.snapshot();
  });

  beforeEach(async () => {
    await testClient.revert({ id: baselineSnapshot });
    baselineSnapshot = await testClient.snapshot();
    await resetDatabase();
    await database.user.create({
      data: {
        displayName: `wallet:${account.address.toLowerCase()}`,
        walletAddress: account.address.toLowerCase(),
      },
    });
  });

  afterAll(async () => {
    await resetDatabase();
    await database.$disconnect();
    anvil.kill("SIGTERM");
  });

  it("waits for the configured confirmation depth before crediting", async () => {
    await deposit(100n);
    await indexer().sync();
    expect(await database.chainDepositEvent.count()).toBe(0);

    await mine(2);
    expect(
      await publicClient.getLogs({
        address: escrowAddress,
        event: parseAbi([
          "event Deposited(address indexed account, uint256 amount)",
        ])[0],
        fromBlock: 0n,
        strict: true,
      }),
    ).toHaveLength(1);
    await indexer().sync();
    expect(await database.chainDepositEvent.findFirstOrThrow()).toMatchObject({
      amount: 100n,
      status: "CREDITED",
    });
  });

  it("credits an exactly decoded deposit once across duplicate replay and restart", async () => {
    const transactionHash = await deposit(125n);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    });
    const depositLog = receipt.logs.find(
      ({ address }) => address.toLowerCase() === escrowAddress.toLowerCase(),
    )!;
    await mine(2);
    const first = indexer();
    await first.sync();
    await first.rewind(1n);
    await Promise.all([first.sync(), indexer().sync()]);

    const events = await database.chainDepositEvent.findMany({
      where: { status: "CREDITED" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: `${CHAIN_ID}:${transactionHash.toLowerCase()}:${depositLog.logIndex}`,
      chainId: BigInt(CHAIN_ID),
      transactionHash: transactionHash.toLowerCase(),
      logIndex: depositLog.logIndex,
      walletAddress: account.address.toLowerCase(),
      amount: 125n,
      status: "CREDITED",
    });
    const escrow = await database.ledgerEntry.aggregate({
      where: { accountId: `escrow:${account.address.toLowerCase()}` },
      _sum: { amount: true },
    });
    const treasury = await database.ledgerEntry.aggregate({
      where: {
        accountId: `treasury:${CHAIN_ID}:${escrowAddress.toLowerCase()}`,
      },
      _sum: { amount: true },
    });
    expect(escrow._sum.amount).toBe(125n);
    expect(treasury._sum.amount).toBe(-125n);
    expect(await database.ledgerTransaction.count()).toBe(3);
  });

  it("does not advance its durable checkpoint when an RPC range fails", async () => {
    await deposit(50n);
    await mine(3);
    let failed = false;
    const flaky = new Proxy(publicClient, {
      get(target, property, receiver) {
        if (property === "getLogs") {
          return async (...args: Parameters<PublicClient["getLogs"]>) => {
            if (!failed) {
              failed = true;
              throw new Error("synthetic RPC failure");
            }
            return Reflect.apply(target.getLogs, target, args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as ChainIndexerClient;

    await expect(indexer(flaky).sync()).rejects.toThrow(
      "synthetic RPC failure",
    );
    expect(
      await database.chainCheckpoint.findUnique({
        where: { chainId: BigInt(CHAIN_ID) },
      }),
    ).toBeNull();
    await indexer(flaky).sync();
    expect(await database.chainDepositEvent.count()).toBe(1);
  });

  it("rejects an RPC endpoint serving a different chain", async () => {
    const wrongChain = new Proxy(publicClient, {
      get(target, property, receiver) {
        if (property === "getChainId") return async () => 1;
        return Reflect.get(target, property, receiver);
      },
    }) as ChainIndexerClient;

    await expect(indexer(wrongChain).sync()).rejects.toThrow(
      "CHAIN_ID_MISMATCH",
    );
    expect(
      await database.chainCheckpoint.findUnique({
        where: { chainId: BigInt(CHAIN_ID) },
      }),
    ).toBeNull();
  });

  it("aborts without mutation when the checkpoint block RPC read fails", async () => {
    await deposit(70n);
    await mine(2);
    await indexer().sync();
    const checkpoint = await database.chainCheckpoint.findUniqueOrThrow({
      where: { chainId: BigInt(CHAIN_ID) },
    });
    const before = {
      event: await database.chainDepositEvent.findFirstOrThrow(),
      transactionCount: await database.ledgerTransaction.count(),
      entryCount: await database.ledgerEntry.count(),
      checkpoint,
    };
    const unavailable = new Proxy(publicClient, {
      get(target, property, receiver) {
        if (property === "getBlock") {
          return async (args: { blockNumber: bigint }) => {
            if (args.blockNumber === checkpoint.blockNumber) {
              throw new Error("synthetic checkpoint RPC outage");
            }
            return target.getBlock(args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as ChainIndexerClient;

    await expect(indexer(unavailable).sync()).rejects.toThrow(
      "synthetic checkpoint RPC outage",
    );
    expect(await database.chainDepositEvent.findFirstOrThrow()).toEqual(
      before.event,
    );
    expect(await database.ledgerTransaction.count()).toBe(
      before.transactionCount,
    );
    expect(await database.ledgerEntry.count()).toBe(before.entryCount);
    expect(
      await database.chainCheckpoint.findUniqueOrThrow({
        where: { chainId: BigInt(CHAIN_ID) },
      }),
    ).toEqual(before.checkpoint);
  });

  it("does not credit logs when the range tip changes around getLogs", async () => {
    const beforeDeposit = await testClient.snapshot();
    const hash = await deposit(90n);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    await mine(2);
    let tipReads = 0;
    const switching = new Proxy(publicClient, {
      get(target, property, receiver) {
        if (property === "getBlock") {
          return async (args: { blockNumber: bigint }) => {
            if (args.blockNumber === receipt.blockNumber) {
              tipReads += 1;
              if (tipReads === 2) {
                await testClient.revert({ id: beforeDeposit });
                await mine(3);
              }
            }
            return target.getBlock(args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as ChainIndexerClient;

    await expect(indexer(switching).sync()).rejects.toThrow(
      "CHAIN_RANGE_CHANGED",
    );
    expect(await database.chainDepositEvent.count()).toBe(0);
    expect(await database.ledgerTransaction.count()).toBe(0);
    const priorRangeCheckpoint = await database.chainCheckpoint.findUnique({
      where: { chainId: BigInt(CHAIN_ID) },
    });
    expect(priorRangeCheckpoint?.blockNumber ?? -1n).toBeLessThan(
      receipt.blockNumber,
    );
  });

  it("rewinds affected postings on a hash mismatch and replays the replacement chain", async () => {
    const beforeDeposit = await testClient.snapshot();
    await deposit(80n);
    await mine(2);
    const service = indexer();
    await service.sync();
    expect(await database.ledgerTransaction.count()).toBe(1);

    await testClient.revert({ id: beforeDeposit });
    await deposit(35n);
    await mine(3);
    await indexer().sync();

    const events = await database.chainDepositEvent.findMany();
    expect(events.filter(({ status }) => status === "CREDITED")).toHaveLength(
      1,
    );
    expect(events.find(({ status }) => status === "CREDITED")?.amount).toBe(
      35n,
    );
    expect(events.filter(({ status }) => status === "REORGED")).toHaveLength(1);
    const balance = await database.ledgerEntry.aggregate({
      where: { accountId: `escrow:${account.address.toLowerCase()}` },
      _sum: { amount: true },
    });
    expect(balance._sum.amount).toBe(35n);
    expect(await database.ledgerTransaction.count()).toBe(3);
    const checkpoint = await database.chainCheckpoint.findUniqueOrThrow({
      where: { chainId: BigInt(CHAIN_ID) },
    });
    expect(checkpoint.blockHash).toBe(
      (await publicClient.getBlock({ blockNumber: checkpoint.blockNumber }))
        .hash,
    );
  });

  it("serializes concurrent sync workers without duplicate credit", async () => {
    await deposit(65n);
    await mine(2);

    await Promise.all([indexer().sync(), indexer().sync()]);

    expect(
      await database.chainDepositEvent.count({ where: { status: "CREDITED" } }),
    ).toBe(1);
    const balance = await database.ledgerEntry.aggregate({
      where: { accountId: `escrow:${account.address.toLowerCase()}` },
      _sum: { amount: true },
    });
    expect(balance._sum.amount).toBe(65n);
  });

  it("finds a common ancestor across a reorg deeper than the rewind window", async () => {
    const forkPoint = await testClient.snapshot();
    await deposit(21n);
    await mine(3);
    await deposit(22n);
    await mine(3);
    const narrowConfig = { ...config(), reorgRewindBlocks: 1n };
    const oldIndexer = new ChainIndexerService(
      publicClient,
      narrowConfig,
      new CheckpointRepository(),
      new Web3LedgerService(),
    );
    await oldIndexer.sync();
    expect(
      await database.chainDepositEvent.count({ where: { status: "CREDITED" } }),
    ).toBe(2);

    await testClient.revert({ id: forkPoint });
    await deposit(33n);
    await mine(8);
    await new ChainIndexerService(
      publicClient,
      narrowConfig,
      new CheckpointRepository(),
      new Web3LedgerService(),
    ).sync();

    const events = await database.chainDepositEvent.findMany();
    expect(events.filter(({ status }) => status === "REORGED")).toHaveLength(2);
    expect(events.filter(({ status }) => status === "CREDITED")).toHaveLength(
      1,
    );
    const balance = await database.ledgerEntry.aggregate({
      where: { accountId: `escrow:${account.address.toLowerCase()}` },
      _sum: { amount: true },
    });
    expect(balance._sum.amount).toBe(33n);
  });

  it("persists unknown-wallet deposits without attributing or crediting them", async () => {
    await database.user.deleteMany();
    await deposit(40n);
    await mine(2);
    await indexer().sync();

    expect(await database.chainDepositEvent.findFirstOrThrow()).toMatchObject({
      walletAddress: account.address.toLowerCase(),
      userId: null,
      ledgerTransactionId: null,
      status: "UNATTRIBUTED",
    });
    expect(await database.ledgerTransaction.count()).toBe(0);
  });

  it("runs indexing from web3 app lifecycle and leaves points startup chain-free", async () => {
    await deposit(44n);
    await mine(2);
    process.env.APP_MODE = "web3";
    process.env.CHAIN_ID = String(CHAIN_ID);
    process.env.CHAIN_RPC_URL = RPC_URL;
    process.env.ESCROW_ADDRESS = escrowAddress;
    process.env.CHAIN_CONFIRMATIONS = "2";
    process.env.CHAIN_INDEXER_RANGE = "2";
    process.env.CHAIN_REORG_REWIND_BLOCKS = "6";
    process.env.CHAIN_POLL_INTERVAL_MS = "20";
    process.env.WALLET_LOGIN_DOMAIN = "poker.test";
    process.env.WALLET_LOGIN_URI = "https://poker.test";
    const web3App = await createApp();
    await web3App.init();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await database.chainDepositEvent.count()) === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(await database.chainDepositEvent.count()).toBe(1);
    await web3App.close();

    process.env.APP_MODE = "points";
    delete process.env.CHAIN_RPC_URL;
    delete process.env.ESCROW_ADDRESS;
    const pointsApp = await createApp();
    await expect(pointsApp.init()).resolves.toBe(pointsApp);
    await pointsApp.close();
  });
});

describe("chain indexer polling lifecycle", () => {
  it("does not overlap polls and resumes after the active poll settles", async () => {
    let resolveFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const sync = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValue(undefined);
    process.env.CHAIN_POLL_INTERVAL_MS = "10";
    const runner = new ChainIndexerRunner({
      sync,
    } as unknown as ChainIndexerService);

    runner.onApplicationBootstrap();
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(sync).toHaveBeenCalledTimes(1);
    resolveFirst();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(sync.mock.calls.length).toBeGreaterThan(1);
    await runner.onApplicationShutdown();
  });

  it("catches a poll failure and retries on a later interval", async () => {
    const sync = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary RPC outage"))
      .mockResolvedValue(undefined);
    process.env.CHAIN_POLL_INTERVAL_MS = "10";
    const runner = new ChainIndexerRunner({
      sync,
    } as unknown as ChainIndexerService);

    runner.onApplicationBootstrap();
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(sync.mock.calls.length).toBeGreaterThanOrEqual(2);
    await runner.onApplicationShutdown();
  });
});
