import { Injectable } from "@nestjs/common";
import {
  commitChainDepositRange,
  creditChainDeposit,
  type ChainCheckpointRecord,
  type ChainDepositInput,
  type ChainIndexerFence,
} from "@poker/db";
import { getAddress, type Address, type Hex } from "viem";

export interface ConfirmedDeposit {
  chainId: number;
  escrowAddress: Address;
  transactionHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Hex;
  walletAddress: Address;
  amount: bigint;
}

@Injectable()
export class Web3LedgerService {
  private toChainDepositInput(deposit: ConfirmedDeposit): ChainDepositInput {
    const walletAddress = getAddress(deposit.walletAddress).toLowerCase();
    const escrowAddress = getAddress(deposit.escrowAddress).toLowerCase();
    const transactionHash = deposit.transactionHash.toLowerCase();
    const id = `${deposit.chainId}:${transactionHash}:${deposit.logIndex}`;

    return {
      id,
      chainId: BigInt(deposit.chainId),
      transactionHash,
      logIndex: deposit.logIndex,
      blockNumber: deposit.blockNumber,
      blockHash: deposit.blockHash.toLowerCase(),
      walletAddress,
      amount: deposit.amount,
      treasuryAccountId: `treasury:${deposit.chainId}:${escrowAddress}`,
      escrowAccountId: `escrow:${walletAddress}`,
    };
  }

  creditDeposit(deposit: ConfirmedDeposit, fence: ChainIndexerFence) {
    return creditChainDeposit(this.toChainDepositInput(deposit), fence);
  }

  commitDepositRange(
    deposits: readonly ConfirmedDeposit[],
    checkpoint: ChainCheckpointRecord,
    fence: ChainIndexerFence,
  ) {
    return commitChainDepositRange(
      {
        deposits: deposits.map((deposit) => this.toChainDepositInput(deposit)),
        checkpoint,
      },
      fence,
    );
  }
}
