import { type DynamicModule, Module } from "@nestjs/common";
import { createPublicClient, getAddress, http } from "viem";
import { baseSepolia } from "viem/chains";

import { Web3LedgerService } from "../settlement/web3-ledger.service.js";
import { CheckpointRepository } from "./checkpoint.repository.js";
import {
  ChainIndexerService,
  type ChainIndexerConfig,
} from "./indexer.service.js";
import { ChainIndexerRunner } from "./indexer.runner.js";

export const CHAIN_INDEXER_CLIENT = Symbol("CHAIN_INDEXER_CLIENT");
export const CHAIN_INDEXER_CONFIG = Symbol("CHAIN_INDEXER_CONFIG");

function positiveBigInt(value: string | undefined, fallback: bigint): bigint {
  const parsed = value === undefined ? fallback : BigInt(value);
  if (parsed <= 0n) throw new Error("CHAIN_INDEXER_VALUE_MUST_BE_POSITIVE");
  return parsed;
}

export function chainIndexerConfigFromEnvironment(): ChainIndexerConfig {
  const chainId = Number(process.env.CHAIN_ID ?? "84532");
  if (chainId !== 84_532)
    throw new Error("CHAIN_ID must be Base Sepolia (84532)");
  if (!process.env.ESCROW_ADDRESS)
    throw new Error("ESCROW_ADDRESS is required");
  if (!process.env.CHAIN_RPC_URL) throw new Error("CHAIN_RPC_URL is required");
  return {
    chainId,
    escrowAddress: getAddress(process.env.ESCROW_ADDRESS),
    rpcUrl: process.env.CHAIN_RPC_URL,
    confirmations: positiveBigInt(process.env.CHAIN_CONFIRMATIONS, 12n),
    rangeSize: positiveBigInt(process.env.CHAIN_INDEXER_RANGE, 500n),
    startBlock: BigInt(process.env.CHAIN_START_BLOCK ?? "0"),
    reorgRewindBlocks: positiveBigInt(
      process.env.CHAIN_REORG_REWIND_BLOCKS,
      24n,
    ),
  };
}

@Module({})
export class ChainModule {
  static forRoot(config = chainIndexerConfigFromEnvironment()): DynamicModule {
    return {
      module: ChainModule,
      providers: [
        { provide: CHAIN_INDEXER_CONFIG, useValue: config },
        {
          provide: CHAIN_INDEXER_CLIENT,
          useFactory: () =>
            createPublicClient({
              chain: baseSepolia,
              transport: http(config.rpcUrl),
            }),
        },
        {
          provide: ChainIndexerService,
          inject: [
            CHAIN_INDEXER_CLIENT,
            CHAIN_INDEXER_CONFIG,
            CheckpointRepository,
            Web3LedgerService,
          ],
          useFactory: (
            client: ReturnType<typeof createPublicClient>,
            value: ChainIndexerConfig,
            checkpoints: CheckpointRepository,
            ledger: Web3LedgerService,
          ) => new ChainIndexerService(client, value, checkpoints, ledger),
        },
        CheckpointRepository,
        Web3LedgerService,
        ChainIndexerRunner,
      ],
      exports: [ChainIndexerService],
    };
  }
}
