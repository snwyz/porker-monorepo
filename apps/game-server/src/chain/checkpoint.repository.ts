import { Injectable } from "@nestjs/common";
import {
  readChainCheckpoint,
  rewindChainDeposits,
  storeChainCheckpoint,
  type ChainCheckpointRecord,
} from "@poker/db";

@Injectable()
export class CheckpointRepository {
  read(chainId: bigint): Promise<ChainCheckpointRecord | null> {
    return readChainCheckpoint(chainId);
  }

  store(checkpoint: ChainCheckpointRecord): Promise<ChainCheckpointRecord> {
    return storeChainCheckpoint(checkpoint);
  }

  rewind(input: {
    chainId: bigint;
    fromBlock: bigint;
    checkpoint: ChainCheckpointRecord | null;
  }): Promise<void> {
    return rewindChainDeposits(input);
  }
}
