export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export const SUITS = ["c", "d", "h", "s"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export type Card = Readonly<{
  code: string;
  rank: Rank;
  suit: Suit;
}>;

export type Deck = readonly Card[];

const rankByCode: Readonly<Record<string, Rank>> = Object.freeze({
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
});

export function parseCard(code: string): Card {
  const normalized = code.trim();
  const rankCode = normalized[0]?.toUpperCase();
  const suit = normalized[1]?.toLowerCase() as Suit | undefined;
  const rank = rankCode === undefined ? undefined : rankByCode[rankCode];

  if (
    normalized.length !== 2 ||
    rank === undefined ||
    suit === undefined ||
    !SUITS.includes(suit)
  ) {
    throw new Error(`Invalid card code: ${code}`);
  }

  return Object.freeze({ code: `${rankCode}${suit}`, rank, suit });
}

export function parseCards(codes: string): Deck {
  const trimmed = codes.trim();
  if (trimmed === "") return Object.freeze([]);
  return Object.freeze(trimmed.split(/\s+/).map(parseCard));
}

export function validateDeck(cards: readonly Card[]): Deck {
  const seen = new Set<string>();
  for (const card of cards) {
    const canonical = parseCard(card.code);
    if (canonical.rank !== card.rank || canonical.suit !== card.suit) {
      throw new Error(`Inconsistent card: ${card.code}`);
    }

    const identity = `${card.rank}:${card.suit}`;
    if (seen.has(identity)) throw new Error(`Duplicate card: ${card.code}`);
    seen.add(identity);
  }
  return Object.freeze([...cards]);
}
