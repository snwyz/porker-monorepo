import { validateDeck, type Card } from "./cards";

export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-kind"
  | "straight-flush";

export type HandScore = Readonly<{
  category: HandCategory;
  value: readonly number[];
}>;

const categories: readonly HandCategory[] = [
  "high-card",
  "pair",
  "two-pair",
  "three-kind",
  "straight",
  "flush",
  "full-house",
  "four-kind",
  "straight-flush",
];

function score(category: HandCategory, kickers: readonly number[]): HandScore {
  return Object.freeze({
    category,
    value: Object.freeze([categories.indexOf(category), ...kickers]),
  });
}

function straightHigh(ranks: readonly number[]): number | undefined {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let index = 0; index <= unique.length - 5; index += 1) {
    const high = unique[index];
    if (
      high !== undefined &&
      unique
        .slice(index, index + 5)
        .every((rank, offset) => rank === high - offset)
    ) {
      return high;
    }
  }
  return undefined;
}

function evaluateFive(cards: readonly Card[]): HandScore {
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const groups = [...new Set(ranks)]
    .map((rank) => ({
      rank,
      count: ranks.filter((candidate) => candidate === rank).length,
    }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const flush = cards.every((card) => card.suit === cards[0]?.suit);
  const straight = straightHigh(ranks);

  if (flush && straight !== undefined)
    return score("straight-flush", [straight]);

  const four = groups.find((group) => group.count === 4);
  if (four !== undefined) {
    return score("four-kind", [
      four.rank,
      groups.find((group) => group.count === 1)?.rank ?? 0,
    ]);
  }

  const three = groups.find((group) => group.count === 3);
  const pair = groups.find((group) => group.count === 2);
  if (three !== undefined && pair !== undefined)
    return score("full-house", [three.rank, pair.rank]);
  if (flush) return score("flush", ranks);
  if (straight !== undefined) return score("straight", [straight]);
  if (three !== undefined) {
    return score("three-kind", [
      three.rank,
      ...groups.filter((group) => group.count === 1).map((group) => group.rank),
    ]);
  }

  const pairs = groups.filter((group) => group.count === 2);
  if (pairs.length >= 2) {
    return score("two-pair", [
      pairs[0]?.rank ?? 0,
      pairs[1]?.rank ?? 0,
      groups.find((group) => group.count === 1)?.rank ?? 0,
    ]);
  }
  if (pair !== undefined) {
    return score("pair", [
      pair.rank,
      ...groups.filter((group) => group.count === 1).map((group) => group.rank),
    ]);
  }
  return score("high-card", ranks);
}

export function compareHands(a: HandScore, b: HandScore): number {
  const length = Math.max(a.value.length, b.value.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a.value[index] ?? 0) - (b.value[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function evaluateSeven(cards: readonly Card[]): HandScore {
  if (cards.length !== 7)
    throw new Error(`Expected exactly seven cards, received ${cards.length}`);
  const deck = validateDeck(cards);
  let best: HandScore | undefined;

  for (let first = 0; first < 3; first += 1) {
    for (let second = first + 1; second < 4; second += 1) {
      for (let third = second + 1; third < 5; third += 1) {
        for (let fourth = third + 1; fourth < 6; fourth += 1) {
          for (let fifth = fourth + 1; fifth < 7; fifth += 1) {
            const hand = [
              deck[first],
              deck[second],
              deck[third],
              deck[fourth],
              deck[fifth],
            ];
            const current = evaluateFive(hand as readonly Card[]);
            if (best === undefined || compareHands(current, best) > 0)
              best = current;
          }
        }
      }
    }
  }

  if (best === undefined) throw new Error("Unable to evaluate hand");
  return best;
}
