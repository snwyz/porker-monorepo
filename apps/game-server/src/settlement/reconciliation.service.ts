import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { createPublicClient, getAddress, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";

import { listReservedWithdrawals, transitionWithdrawal } from "@poker/db";

const usedNoncesAbi = [
  {
    type: "function",
    name: "usedNonces",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [{ name: "consumed", type: "bool" }],
  },
] as const;

export interface ReconciliationClient {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getBlock(input: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
  readContract(input: {
    address: Address;
    abi: typeof usedNoncesAbi;
    functionName: "usedNonces";
    args: readonly [Address, bigint];
    blockNumber: bigint;
  }): Promise<boolean>;
}

@Injectable()
export class ReconciliationService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: NodeJS.Timeout;
  private running = false;

  private client(): ReconciliationClient {
    const rpcUrl = process.env.CHAIN_RPC_URL;
    if (!rpcUrl) throw new Error("CHAIN_RPC_URL is required");
    return createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
    }) as ReconciliationClient;
  }

  onApplicationBootstrap(): void {
    const interval = Number(
      process.env.WITHDRAWAL_RECONCILE_INTERVAL_MS ?? "10000",
    );
    if (!Number.isSafeInteger(interval) || interval <= 0)
      throw new Error("WITHDRAWAL_RECONCILE_INTERVAL_INVALID");
    this.timer = setInterval(
      () => void this.reconcilePending().catch(() => undefined),
      interval,
    );
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcilePending(
    client: ReconciliationClient = this.client(),
  ): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const actualChainId = await client.getChainId();
      const configuredChainId = Number(process.env.CHAIN_ID ?? "84532");
      if (configuredChainId !== 84_532 || actualChainId !== configuredChainId)
        throw new Error("WITHDRAWAL_CHAIN_ID_MISMATCH");
      const confirmations = BigInt(process.env.CHAIN_CONFIRMATIONS ?? "12");
      if (confirmations <= 0n)
        throw new Error("CHAIN_CONFIRMATIONS_MUST_BE_POSITIVE");
      const latestBlockNumber = await client.getBlockNumber();
      if (latestBlockNumber < confirmations) return;
      const confirmedBlockNumber = latestBlockNumber - confirmations;
      const confirmedBlock = await client.getBlock({
        blockNumber: confirmedBlockNumber,
      });
      for (const withdrawal of await listReservedWithdrawals()) {
        if (withdrawal.chainId !== BigInt(actualChainId)) continue;
        const consumed = await client.readContract({
          address: getAddress(withdrawal.escrowAddress) as Address,
          abi: usedNoncesAbi,
          functionName: "usedNonces",
          args: [getAddress(withdrawal.walletAddress), withdrawal.nonce],
          blockNumber: confirmedBlockNumber,
        });
        if (consumed) {
          await transitionWithdrawal(withdrawal.id, "COMPLETED");
        } else if (
          confirmedBlock.timestamp >
          BigInt(Math.floor(withdrawal.deadline.getTime() / 1_000))
        ) {
          await transitionWithdrawal(withdrawal.id, "RELEASED");
        }
      }
    } finally {
      this.running = false;
    }
  }
}
