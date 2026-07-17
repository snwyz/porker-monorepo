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
} from "@poker/db";

import type { AppMode } from "../config/app-mode.js";
import { APP_MODE } from "../config/tokens.js";
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

function badProof(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: "Bad Request",
    message: "Invalid wallet proof",
    code: "INVALID_WALLET_PROOF",
  });
}

function rejected(code: string): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    error: "Unauthorized",
    message: "Wallet proof rejected",
    code,
  });
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
      throw new BadRequestException({ code: "INVALID_ADDRESS" });
    }
    try {
      return getAddress(value).toLowerCase();
    } catch {
      throw new BadRequestException({ code: "INVALID_ADDRESS" });
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
    if (parsed.domain !== this.domain) throw rejected("INVALID_DOMAIN");
    if (parsed.uri !== this.uri) throw rejected("INVALID_URI");
    if (parsed.version !== "1") throw rejected("INVALID_VERSION");
    if (parsed.chainId !== WALLET_LOGIN_CHAIN_ID) {
      throw rejected("INVALID_CHAIN");
    }

    const now = new Date();
    if (parsed.issuedAt.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) {
      throw rejected("ISSUED_AT_FUTURE");
    }
    if (parsed.issuedAt.getTime() < now.getTime() - MAX_MESSAGE_AGE_MS) {
      throw rejected("ISSUED_AT_TOO_OLD");
    }
    if (parsed.expirationTime <= now) throw rejected("MESSAGE_EXPIRED");
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
      throw rejected("ADDRESS_MISMATCH");
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
          throw rejected("NONCE_CONSUMED");
        }
        if (error.message === "NONCE_EXPIRED") {
          throw rejected("NONCE_EXPIRED");
        }
        if (error.message === "NONCE_INVALID") {
          throw rejected("NONCE_INVALID");
        }
      }
      throw error;
    }
  }
}
