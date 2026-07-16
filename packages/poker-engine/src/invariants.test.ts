/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { describe, expect, it } from "vitest";

import {
  assertInvariants,
  parseCards,
  startHand,
  type TableState,
} from "./index";

const fullDeck = () =>
  parseCards(
    ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
      .flatMap((rank) => ["c", "d", "h", "s"].map((suit) => `${rank}${suit}`))
      .join(" "),
  );

function validState(): TableState {
  return startHand({
    tableId: "table-invariants",
    handId: "hand-invariants",
    players: [
      { id: "p1", stack: 100 },
      { id: "p2", stack: 100 },
      { id: "p3", stack: 100 },
    ],
    buttonSeat: 0,
    blinds: [5, 10],
    deck: fullDeck(),
  });
}

describe("table state invariants", () => {
  it("accepts a real dealt hand", () => {
    expect(() => assertInvariants(validState())).not.toThrow();
  });

  it.each([
    [
      "non-negative integer seats",
      (state: TableState) => ({
        ...state,
        players: state.players.map((player, index) =>
          index === 0 ? { ...player, seat: -1 } : player,
        ),
      }),
      "seat",
    ],
    [
      "button ownership",
      (state: TableState) => ({ ...state, buttonSeat: 99 }),
      "button",
    ],
    [
      "blind configuration",
      (state: TableState) => ({ ...state, smallBlind: 10, bigBlind: 10 }),
      "blind",
    ],
    [
      "minimum raise configuration",
      (state: TableState) => ({ ...state, minimumRaise: 0 }),
      "minimum raise",
    ],
    [
      "betting metadata chips",
      (state: TableState) => ({
        ...state,
        lastActedBet: { [state.actorId]: -1 },
      }),
      "metadata chips",
    ],
    [
      "active players have chips",
      (state: TableState) => ({
        ...state,
        players: state.players.map((player) =>
          player.id === state.actorId ? { ...player, stack: 0 } : player,
        ),
      }),
      "active",
    ],
    [
      "all-in players have no chips",
      (state: TableState) => ({
        ...state,
        players: state.players.map((player) =>
          player.id === "p3"
            ? { ...player, status: "all-in" as const }
            : player,
        ),
      }),
      "all-in",
    ],
    [
      "live actor eligibility",
      (state: TableState) => ({
        ...state,
        players: state.players.map((player) =>
          player.id === state.actorId
            ? { ...player, status: "folded" as const }
            : player,
        ),
      }),
      "actor",
    ],
    [
      "street board count",
      (state: TableState) => ({ ...state, phase: "flop" as const }),
      "board",
    ],
    [
      "two hole cards for participating players",
      (state: TableState) => ({
        ...state,
        holeCards: { ...state.holeCards, p1: state.holeCards.p1!.slice(0, 1) },
      }),
      "hole",
    ],
    [
      "hole-card ownership",
      (state: TableState) => ({
        ...state,
        holeCards: { ...state.holeCards, ghost: [] },
      }),
      "ownership",
    ],
  ] as const)("rejects invalid %s", (_, mutate, message) => {
    expect(() => assertInvariants(mutate(validState()))).toThrow(message);
  });
});
