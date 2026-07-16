import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
} from "node:crypto";

import { parseCard, type Deck } from "@poker/engine";

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["c", "d", "h", "s"];

export interface AuditableDeck {
  deck: Deck;
  seed: string;
}

export interface EncryptedEnvelope {
  ciphertext: string;
}

export function encryptTableState(
  auditKey: string,
  state: unknown,
): EncryptedEnvelope {
  if (auditKey.length < 32) throw new Error("INVALID_AUDIT_KEY");
  const key = createHash("sha256").update(auditKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(state), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      "base64url",
    ),
  };
}

export function decryptTableState(
  auditKey: string,
  envelope: unknown,
): unknown {
  if (
    !envelope ||
    typeof envelope !== "object" ||
    typeof (envelope as { ciphertext?: unknown }).ciphertext !== "string"
  ) {
    throw new Error("INVALID_SNAPSHOT_ENVELOPE");
  }
  const bytes = Buffer.from(
    (envelope as { ciphertext: string }).ciphertext,
    "base64url",
  );
  if (bytes.length < 29) throw new Error("INVALID_SNAPSHOT_ENVELOPE");
  const key = createHash("sha256").update(auditKey).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  ) as unknown;
}

export function createAuditableDeck(): AuditableDeck {
  const seed = randomBytes(32).toString("base64url");
  const deck = SUITS.flatMap((suit) =>
    RANKS.map((rank) => parseCard(`${rank}${suit}`)),
  );
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [deck[index], deck[swap]] = [deck[swap]!, deck[index]!];
  }
  return { deck: Object.freeze(deck), seed };
}

export function encryptDeckAudit(
  auditKey: string,
  audit: AuditableDeck,
): string {
  if (auditKey.length < 32) throw new Error("INVALID_AUDIT_KEY");
  const key = createHash("sha256").update(auditKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify({
    seed: audit.seed,
    deck: audit.deck.map((card) => card.code),
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}
