import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { getAddress, recoverMessageAddress, type Hex } from "viem";

import {
  consumeWalletNonceAndCreateSession,
  createWalletNonce,
  findActiveWalletSession,
  getBalance,
} from "@poker/db";

import type { AppMode } from "../config/app-mode.js";
import { APP_MODE } from "../config/tokens.js";
import { localizedProblem, messageCode } from "../i18n/message-code.js";
import {
  parseWalletLoginMessage,
  WALLET_LOGIN_CHAIN_ID,
} from "./login-message.js";

const NONCE_TTL_MS = 5 * 60 * 1_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 60 * 1_000;
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1_000;

export interface IssuedWalletNonce {
  nonce: string;
  expiresAt: string;
}

export interface WalletIdentity {
  address: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sessionToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,}$/.test(value)
    ? value
    : null;
}

function badProof(): BadRequestException {
  return new BadRequestException(
    localizedProblem(messageCode.walletProofInvalid),
  );
}

function rejected(): UnauthorizedException {
  return new UnauthorizedException(
    localizedProblem(messageCode.walletProofRejected),
  );
}

@Injectable()
export class WalletService {
  private readonly domain: string;
  private readonly uri: string;

  constructor(@Inject(APP_MODE) mode: AppMode) {
    this.domain = process.env.WALLET_LOGIN_DOMAIN ?? "";
    this.uri = process.env.WALLET_LOGIN_URI ?? "";
    if (mode === "web3" && (!this.domain || !this.uri)) {
      throw new Error("WALLET_LOGIN_DOMAIN and WALLET_LOGIN_URI are required");
    }
  }

  parseAddress(value: unknown): string {
    if (typeof value !== "string") {
      throw new BadRequestException(
        localizedProblem(messageCode.walletAddressInvalid),
      );
    }
    try {
      return getAddress(value).toLowerCase();
    } catch {
      throw new BadRequestException(
        localizedProblem(messageCode.walletAddressInvalid),
      );
    }
  }

  async issueNonce(address: string): Promise<IssuedWalletNonce> {
    const nonce = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
    await createWalletNonce({ address, nonceHash: sha256(nonce), expiresAt });
    return { nonce, expiresAt: expiresAt.toISOString() };
  }

  async verify(
    messageValue: unknown,
    signatureValue: unknown,
  ): Promise<{
    identity: WalletIdentity;
    token: string;
  }> {
    if (
      typeof messageValue !== "string" ||
      typeof signatureValue !== "string"
    ) {
      throw badProof();
    }
    const parsed = parseWalletLoginMessage(messageValue);
    if (!parsed || !/^0x[0-9a-fA-F]{130}$/.test(signatureValue)) {
      throw badProof();
    }
    if (parsed.domain !== this.domain) throw rejected();
    if (parsed.uri !== this.uri) throw rejected();
    if (parsed.version !== "1") throw rejected();
    if (parsed.chainId !== WALLET_LOGIN_CHAIN_ID) {
      throw rejected();
    }

    const now = new Date();
    if (parsed.issuedAt.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) {
      throw rejected();
    }
    if (parsed.issuedAt.getTime() < now.getTime() - MAX_MESSAGE_AGE_MS) {
      throw rejected();
    }
    if (parsed.expirationTime <= now) throw rejected();
    if (parsed.expirationTime <= parsed.issuedAt) throw badProof();

    let claimedAddress: string;
    let recoveredAddress: string;
    try {
      claimedAddress = getAddress(parsed.address).toLowerCase();
      recoveredAddress = (
        await recoverMessageAddress({
          message: messageValue,
          signature: signatureValue as Hex,
        })
      ).toLowerCase();
    } catch {
      throw badProof();
    }
    if (recoveredAddress !== claimedAddress) {
      throw rejected();
    }

    const token = randomBytes(32).toString("base64url");
    try {
      const login = await consumeWalletNonceAndCreateSession({
        address: claimedAddress,
        nonceHash: sha256(parsed.nonce),
        now,
        tokenHash: sha256(token),
        sessionExpiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      });
      return {
        identity: { address: getAddress(login.walletAddress) },
        token,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "NONCE_CONSUMED") {
          throw rejected();
        }
        if (error.message === "NONCE_EXPIRED") {
          throw rejected();
        }
        if (error.message === "NONCE_INVALID") {
          throw rejected();
        }
      }
      throw error;
    }
  }

  async balance(
    rawToken: unknown,
  ): Promise<{ address: string; escrow: string }> {
    const token = sessionToken(rawToken);
    if (!token) {
      throw new UnauthorizedException(
        localizedProblem(messageCode.authenticationRequired),
      );
    }
    const session = await findActiveWalletSession(sha256(token), new Date());
    if (!session?.user.walletAddress) {
      throw new UnauthorizedException(
        localizedProblem(messageCode.authenticationRequired),
      );
    }
    const address = getAddress(session.user.walletAddress);
    const escrow = await getBalance(`escrow:${address.toLowerCase()}`);
    return { address, escrow: escrow.toString() };
  }
}
