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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma as database } from "../../../packages/db/src/client.js";
import { CheckpointRepository } from "../src/chain/checkpoint.repository.js";
import {
  ChainIndexerService,
  type ChainIndexerClient,
} from "../src/chain/indexer.service.js";
import { Web3LedgerService } from "../src/settlement/web3-ledger.service.js";

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
    await first.sync();
    await indexer().sync();

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
});
