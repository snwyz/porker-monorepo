import { Injectable } from "@nestjs/common";
import { creditChainDeposit } from "@poker/db";
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
  creditDeposit(deposit: ConfirmedDeposit) {
    const walletAddress = getAddress(deposit.walletAddress).toLowerCase();
    const escrowAddress = getAddress(deposit.escrowAddress).toLowerCase();
    const transactionHash = deposit.transactionHash.toLowerCase();
    const id = `${deposit.chainId}:${transactionHash}:${deposit.logIndex}`;

    return creditChainDeposit({
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
    });
  }
}
