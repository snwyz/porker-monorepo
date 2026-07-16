import { describe, expect, it } from "vitest";
import {
  compareHands,
  evaluateSeven,
  parseCard,
  parseCards,
  validateDeck,
} from "./index";

describe("evaluateSeven", () => {
  it.each([
    ["As Ks Qs Js Ts 2d 3c", "straight-flush"],
    ["Ah Ad Ac As 2d 3c 4h", "four-kind"],
    ["Kh Kd Ks 2c 2d 8h 9s", "full-house"],
    ["Ah 2d 3s 4c 5h Kd Qd", "straight"],
  ])("scores %s as %s", (codes, category) => {
    expect(evaluateSeven(parseCards(codes)).category).toBe(category);
  });

  it.each([
    [
      "high-card",
      "As Kd Qc 9h 7s 4d 2c",
      "As Kd Qc 9h 6s 4d 2c",
      "Ac Kh Qd 9s 7c 3h 2d",
    ],
    [
      "pair",
      "As Ad Kc Qh Js 4d 2c",
      "As Ad Kc Qh Ts 4d 2c",
      "Ac Ah Ks Qd Jc 3h 2d",
    ],
    [
      "two-pair",
      "As Ad Kc Kh Qs 4d 2c",
      "As Ad Kc Kh Js 4d 2c",
      "Ac Ah Ks Kd Qc 3h 2d",
    ],
    [
      "three-kind",
      "As Ad Ac Kh Qs 4d 2c",
      "As Ad Ac Kh Js 4d 2c",
      "Ah As Ac Kd Qc 3h 2d",
    ],
    [
      "straight",
      "As Kd Qc Jh Ts 4d 2c",
      "Ks Qd Jc Th 9s 4d 2c",
      "Ac Kh Qd Js Tc 3h 2d",
    ],
    [
      "flush",
      "Ah Kh Qh 9h 7h 4d 2c",
      "Ah Kh Jh 9h 7h 4d 2c",
      "As Ks Qs 9s 7s 3h 2d",
    ],
    [
      "full-house",
      "As Ad Ac Kh Ks 4d 2c",
      "As Ad Ac Qh Qs 4d 2c",
      "Ah As Ac Kd Kc 3h 2d",
    ],
    [
      "four-kind",
      "As Ad Ac Ah Ks 4d 2c",
      "As Ad Ac Ah Qs 4d 2c",
      "As Ad Ac Ah Kc 3h 2d",
    ],
    [
      "straight-flush",
      "As Ks Qs Js Ts 4d 2c",
      "Ks Qs Js Ts 9s 4d 2c",
      "Ah Kh Qh Jh Th 3s 2d",
    ],
  ])(
    "compares winner and tie examples for %s",
    (category, winningCodes, losingCodes, tiedCodes) => {
      const winner = evaluateSeven(parseCards(winningCodes));
      const loser = evaluateSeven(parseCards(losingCodes));
      const tie = evaluateSeven(parseCards(tiedCodes));

      expect(winner.category).toBe(category);
      expect(loser.category).toBe(category);
      expect(tie.category).toBe(category);
      expect(compareHands(winner, loser)).toBe(1);
      expect(compareHands(loser, winner)).toBe(-1);
      expect(compareHands(winner, tie)).toBe(0);
    },
  );

  it("uses the highest relevant kicker", () => {
    const kingKicker = evaluateSeven(parseCards("As Ad Kh Qc Js 4d 2c"));
    const queenKicker = evaluateSeven(parseCards("As Ad Qh Jc Ts 4d 2c"));

    expect(compareHands(kingKicker, queenKicker)).toBe(1);
  });

  it("treats ace as low only in a five-high wheel", () => {
    const wheel = evaluateSeven(parseCards("Ah 2d 3s 4c 5h Kd Qd"));
    const sixHigh = evaluateSeven(parseCards("2h 3d 4s 5c 6h Kd Qd"));

    expect(wheel.value).toEqual([4, 5]);
    expect(compareHands(wheel, sixHigh)).toBe(-1);
  });

  it("rejects duplicate cards", () => {
    expect(() => evaluateSeven(parseCards("As As Qs Js Ts 2d 3c"))).toThrow(
      "Duplicate card: As",
    );
  });

  it.each(["As Ks Qs Js Ts 2d", "As Ks Qs Js Ts 2d 3c 4h"])(
    "rejects a non-seven-card hand: %s",
    (codes) => {
      expect(() => evaluateSeven(parseCards(codes))).toThrow(
        "Expected exactly seven cards",
      );
    },
  );
});

describe("cards", () => {
  it("rejects structurally constructed duplicate cards with noncanonical codes", () => {
    const aceOfSpades = { code: "As", rank: 14, suit: "s" } as const;
    const sameAceWithLowercaseCode = {
      code: "as",
      rank: 14,
      suit: "s",
    } as const;

    expect(() => validateDeck([aceOfSpades, sameAceWithLowercaseCode])).toThrow(
      "Duplicate card",
    );
  });

  it("parses and freezes cards and validated decks", () => {
    const card = parseCard("as");
    const deck = validateDeck([card]);

    expect(card).toEqual({ code: "As", rank: 14, suit: "s" });
    expect(Object.isFrozen(card)).toBe(true);
    expect(Object.isFrozen(deck)).toBe(true);
  });

  it.each(["", "1s", "Asx", "AX"])("rejects invalid card code %j", (code) => {
    expect(() => parseCard(code)).toThrow("Invalid card code");
  });
});
