import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { getAddress, type Address } from "viem";

import {
  findActiveWalletSession,
  findWithdrawalForUser,
  reserveWithdrawal,
} from "@poker/db";

import { OperatorSigner } from "./operator-signer.js";

const VOUCHER_TTL_SECONDS = 15 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenFromCookie(value: unknown): string | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{32,}$/.test(value))
    return null;
  return value;
}

function view(withdrawal: {
  id: string;
  walletAddress: string;
  amount: bigint;
  nonce: bigint;
  deadline: Date;
  signature: string;
  status: string;
  chainId: bigint;
  escrowAddress: string;
  chainTransactionHash: string | null;
}) {
  return {
    id: withdrawal.id,
    account: getAddress(withdrawal.walletAddress),
    amount: withdrawal.amount.toString(),
    nonce: withdrawal.nonce.toString(),
    deadline: BigInt(
      Math.floor(withdrawal.deadline.getTime() / 1_000),
    ).toString(),
    signature: withdrawal.signature,
    status: withdrawal.status,
    chainId: Number(withdrawal.chainId),
    escrowAddress: getAddress(withdrawal.escrowAddress),
    chainTransactionHash: withdrawal.chainTransactionHash,
  };
}

@Injectable()
export class WithdrawalService {
  constructor(private readonly signer: OperatorSigner) {}

  private async identity(rawToken: unknown) {
    const token = tokenFromCookie(rawToken);
    if (!token)
      throw new UnauthorizedException({ code: "WALLET_AUTH_REQUIRED" });
    const session = await findActiveWalletSession(hashToken(token), new Date());
    if (!session?.user.walletAddress) {
      throw new UnauthorizedException({ code: "WALLET_AUTH_REQUIRED" });
    }
    return {
      userId: session.userId,
      walletAddress: session.user.walletAddress,
    };
  }

  async request(
    rawToken: unknown,
    amountValue: unknown,
    idempotencyKey?: string,
  ) {
    const identity = await this.identity(rawToken);
    if (typeof amountValue !== "string" || !/^[1-9][0-9]*$/.test(amountValue)) {
      throw new BadRequestException({ code: "INVALID_WITHDRAWAL_AMOUNT" });
    }
    if (
      idempotencyKey !== undefined &&
      (idempotencyKey.length < 1 || idempotencyKey.length > 128)
    ) {
      throw new BadRequestException({ code: "INVALID_IDEMPOTENCY_KEY" });
    }
    const chainId = Number(process.env.CHAIN_ID ?? "84532");
    const escrowValue = process.env.ESCROW_ADDRESS;
    if (chainId !== 84_532 || !escrowValue)
      throw new Error("WITHDRAWAL_CHAIN_CONFIG_INVALID");
    let escrowAddress: Address;
    try {
      escrowAddress = getAddress(escrowValue);
    } catch {
      throw new Error("WITHDRAWAL_CHAIN_CONFIG_INVALID");
    }
    const deadline = new Date(Date.now() + VOUCHER_TTL_SECONDS * 1_000);
    try {
      const withdrawal = await reserveWithdrawal(
        {
          ...identity,
          amount: BigInt(amountValue),
          chainId: BigInt(chainId),
          escrowAddress: escrowAddress.toLowerCase(),
          deadline,
          idempotencyKey,
        },
        (draft) =>
          this.signer.sign({
            chainId,
            escrowAddress,
            account: getAddress(draft.walletAddress),
            amount: draft.amount,
            nonce: draft.nonce,
            deadline: BigInt(Math.floor(draft.deadline.getTime() / 1_000)),
          }),
      );
      return view(withdrawal);
    } catch (error) {
      if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
        throw new ConflictException({ code: "INSUFFICIENT_ESCROW" });
      }
      if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") {
        throw new ConflictException({ code: "IDEMPOTENCY_CONFLICT" });
      }
      throw error;
    }
  }

  async get(rawToken: unknown, id: string) {
    const identity = await this.identity(rawToken);
    const withdrawal = await findWithdrawalForUser(id, identity.userId);
    if (!withdrawal) throw new NotFoundException();
    return view(withdrawal);
  }
}
