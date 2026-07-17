import { Injectable } from "@nestjs/common";
import {
  getAddress,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { Web3LedgerService } from "../settlement/web3-ledger.service.js";
import { CheckpointRepository } from "./checkpoint.repository.js";

const depositedEvent = parseAbiItem(
  "event Deposited(address indexed account, uint256 amount)",
);

export type ChainIndexerClient = Pick<
  PublicClient,
  "getChainId" | "getBlockNumber" | "getBlock" | "getLogs"
>;

export interface ChainIndexerConfig {
  chainId: number;
  escrowAddress: Address;
  rpcUrl: string;
  confirmations: bigint;
  rangeSize: bigint;
  startBlock: bigint;
  reorgRewindBlocks: bigint;
}

function minimum(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function maximum(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

@Injectable()
export class ChainIndexerService {
  constructor(
    private readonly client: ChainIndexerClient,
    private readonly config: ChainIndexerConfig,
    private readonly checkpoints: CheckpointRepository,
    private readonly ledger: Web3LedgerService,
  ) {
    if (config.chainId !== 84_532) throw new Error("UNSUPPORTED_CHAIN");
    if (config.confirmations < 0n) throw new Error("INVALID_CONFIRMATIONS");
    if (config.rangeSize <= 0n) throw new Error("INVALID_RANGE_SIZE");
    if (config.reorgRewindBlocks <= 0n) {
      throw new Error("INVALID_REORG_REWIND_BLOCKS");
    }
  }

  async sync(): Promise<void> {
    return this.checkpoints.withLock(BigInt(this.config.chainId), () =>
      this.syncLocked(),
    );
  }

  async rewind(fromBlock: bigint): Promise<void> {
    return this.checkpoints.withLock(BigInt(this.config.chainId), () =>
      this.rewindLocked(fromBlock),
    );
  }

  private async syncLocked(): Promise<void> {
    if ((await this.client.getChainId()) !== this.config.chainId) {
      throw new Error("CHAIN_ID_MISMATCH");
    }
    const latestBlock = await this.client.getBlockNumber({ cacheTime: 0 });
    if (latestBlock < this.config.confirmations) return;
    const safeTip = latestBlock - this.config.confirmations;

    let checkpoint = await this.checkpoints.read(BigInt(this.config.chainId));
    if (checkpoint) {
      const canonicalHash = (
        await this.client.getBlock({ blockNumber: checkpoint.blockNumber })
      ).hash;
      if (canonicalHash.toLowerCase() !== checkpoint.blockHash.toLowerCase()) {
        const commonAncestor = await this.findCommonAncestor(
          checkpoint.blockNumber,
        );
        const rewindFrom = commonAncestor
          ? commonAncestor.blockNumber + 1n
          : this.config.startBlock;
        await this.rewindLocked(rewindFrom);
        checkpoint = await this.checkpoints.read(BigInt(this.config.chainId));
      }
    }

    let fromBlock = checkpoint
      ? checkpoint.blockNumber + 1n
      : this.config.startBlock;
    while (fromBlock <= safeTip) {
      const toBlock = minimum(safeTip, fromBlock + this.config.rangeSize - 1n);
      await this.processRange(fromBlock, toBlock);
      fromBlock = toBlock + 1n;
    }
  }

  private async rewindLocked(fromBlock: bigint): Promise<void> {
    const boundedFrom = maximum(this.config.startBlock, fromBlock);
    const previousBlock = boundedFrom - 1n;
    const checkpoint =
      boundedFrom > this.config.startBlock
        ? await this.client
            .getBlock({ blockNumber: previousBlock })
            .then((block) => ({
              chainId: BigInt(this.config.chainId),
              blockNumber: previousBlock,
              blockHash: block.hash.toLowerCase(),
            }))
        : null;
    await this.checkpoints.rewind({
      chainId: BigInt(this.config.chainId),
      fromBlock: boundedFrom,
      checkpoint,
    });
  }

  private async processRange(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<void> {
    const rangeTipBefore = await this.client.getBlock({
      blockNumber: toBlock,
    });
    const logs = await this.client.getLogs({
      address: this.config.escrowAddress,
      event: depositedEvent,
      fromBlock,
      toBlock,
      strict: true,
    });
    const rangeTipAfter = await this.client.getBlock({ blockNumber: toBlock });
    if (
      rangeTipBefore.hash.toLowerCase() !== rangeTipAfter.hash.toLowerCase()
    ) {
      throw new Error("CHAIN_RANGE_CHANGED");
    }

    for (const log of logs) {
      if (
        log.transactionHash === null ||
        log.logIndex === null ||
        log.blockHash === null ||
        log.blockNumber === null
      ) {
        throw new Error("INCOMPLETE_DEPOSIT_LOG");
      }
      const args = log.args as { account: Address; amount: bigint };
      await this.ledger.creditDeposit({
        chainId: this.config.chainId,
        escrowAddress: getAddress(this.config.escrowAddress),
        transactionHash: log.transactionHash as Hex,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash as Hex,
        walletAddress: getAddress(args.account),
        amount: args.amount,
      });
    }

    await this.checkpoints.store({
      chainId: BigInt(this.config.chainId),
      blockNumber: toBlock,
      blockHash: rangeTipAfter.hash.toLowerCase(),
    });
  }

  private async findCommonAncestor(
    belowBlock: bigint,
  ): Promise<{ blockNumber: bigint; blockHash: string } | null> {
    const history = await this.checkpoints.historyBefore(
      BigInt(this.config.chainId),
      belowBlock,
    );
    for (const candidate of history) {
      const canonical = await this.client.getBlock({
        blockNumber: candidate.blockNumber,
      });
      if (canonical.hash.toLowerCase() === candidate.blockHash.toLowerCase()) {
        return candidate;
      }
    }
    return null;
  }
}
