import {
  createCipheriv,
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
