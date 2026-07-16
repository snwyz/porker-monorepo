import { ConflictException, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import {
  createGuestWithGrant,
  findActiveGuestSession,
  getBalance,
} from "@poker/db";

const GuestNicknameSchema = z.string().regex(/^[A-Za-z0-9_]{3,24}$/);
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const INITIAL_GRANT = 10_000n;

export interface GuestIdentity {
  nickname: string;
  points: string;
}

export interface GuestSessionResult {
  identity: GuestIdentity;
  token?: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class GuestService {
  parseNickname(value: unknown): string {
    return GuestNicknameSchema.parse(value);
  }

  async createOrReuse(
    nickname: string,
    existingToken?: string,
  ): Promise<GuestSessionResult> {
    if (existingToken) {
      const session = await findActiveGuestSession(
        hashToken(existingToken),
        new Date(),
      );
      if (session) {
        return {
          identity: {
            nickname: session.displayName,
            points: (await getBalance(`points:${session.userId}`)).toString(),
          },
        };
      }
    }

    const token = randomBytes(32).toString("base64url");
    try {
      const user = await createGuestWithGrant({
        displayName: nickname,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        grantAmount: INITIAL_GRANT,
      });
      return {
        identity: {
          nickname: user.displayName,
          points: INITIAL_GRANT.toString(),
        },
        token,
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Nickname is already taken");
      }
      throw error;
    }
  }
}
