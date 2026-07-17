import { Injectable } from "@nestjs/common";
import {
  getAddress,
  type Address,
  type Hex,
  type TypedDataDefinition,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface WithdrawalVoucher {
  chainId: number;
  escrowAddress: Address;
  account: Address;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
}

export function withdrawalTypedData(voucher: WithdrawalVoucher) {
  return {
    domain: {
      name: "PokerEscrow",
      version: "1",
      chainId: voucher.chainId,
      verifyingContract: voucher.escrowAddress,
    },
    types: {
      Withdrawal: [
        { name: "account", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Withdrawal" as const,
    message: {
      account: voucher.account,
      amount: voucher.amount,
      nonce: voucher.nonce,
      deadline: voucher.deadline,
    },
  };
}

@Injectable()
export class OperatorSigner {
  async sign(voucher: WithdrawalVoucher): Promise<Hex> {
    const privateKey = process.env.OPERATOR_PRIVATE_KEY;
    const expectedAddress = process.env.OPERATOR_ADDRESS;
    if (
      !privateKey ||
      !expectedAddress ||
      !/^0x[0-9a-fA-F]{64}$/.test(privateKey)
    ) {
      throw new Error("OPERATOR_SIGNER_CONFIG_INVALID");
    }
    let account;
    try {
      account = privateKeyToAccount(privateKey as Hex);
      if (account.address !== getAddress(expectedAddress)) {
        throw new Error("OPERATOR_SIGNER_MISMATCH");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "OPERATOR_SIGNER_MISMATCH"
      )
        throw error;
      throw new Error("OPERATOR_SIGNER_CONFIG_INVALID", { cause: error });
    }
    return account.signTypedData(
      withdrawalTypedData(voucher) as TypedDataDefinition,
    );
  }
}
