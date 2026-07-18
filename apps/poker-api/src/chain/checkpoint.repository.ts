import { Injectable } from "@nestjs/common";
import {
  readChainCheckpoint,
  listChainCheckpointHistory,
  rewindChainDeposits,
  storeChainCheckpoint,
  withChainIndexerLock,
  type ChainCheckpointRecord,
  type ChainIndexerFence,
} from "@poker/db";

@Injectable()
export class CheckpointRepository {
  withLock<T>(
    chainId: bigint,
    operation: (fence: ChainIndexerFence) => Promise<T>,
  ): Promise<T> {
    return withChainIndexerLock(chainId, operation);
  }

  read(chainId: bigint): Promise<ChainCheckpointRecord | null> {
    return readChainCheckpoint(chainId);
  }

  historyBefore(
    chainId: bigint,
    belowBlock: bigint,
  ): Promise<ChainCheckpointRecord[]> {
    return listChainCheckpointHistory(chainId, belowBlock);
  }

  store(
    checkpoint: ChainCheckpointRecord,
    fence: ChainIndexerFence,
  ): Promise<ChainCheckpointRecord> {
    return storeChainCheckpoint(checkpoint, fence);
  }

  rewind(
    input: {
      chainId: bigint;
      fromBlock: bigint;
      checkpoint: ChainCheckpointRecord | null;
    },
    fence: ChainIndexerFence,
  ): Promise<void> {
    return rewindChainDeposits(input, fence);
  }
}
