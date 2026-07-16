/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { describe, expect, it } from "vitest";

import {
  applyCommand,
  buildPots,
  parseCards,
  settleShowdown,
  startHand,
  type TablePlayer,
  type TableState,
} from "./index";

function playersWithCommitments(
  commitments: readonly number[],
  folded: readonly string[] = [],
): TablePlayer[] {
  return commitments.map((handCommitted, seat) => ({
    id: `p${seat + 1}`,
    seat,
    stack: 0,
    streetCommitted: handCommitted,
    handCommitted,
    status: folded.includes(`p${seat + 1}`) ? "folded" : "all-in",
  }));
}

function showdownState(overrides: Partial<TableState> = {}): TableState {
  return {
    tableId: "table-1",
    handId: "hand-1",
    phase: "complete",
    version: 3,
    buttonSeat: 0,
    actorId: "p1",
    currentBet: 100,
    minimumRaise: 10,
    smallBlind: 5,
    bigBlind: 10,
    players: playersWithCommitments([100, 100, 100]),
    actedPlayerIds: [],
    raiseRights: [],
    lastActedBet: {},
    deck: [],
    board: parseCards("2c 3d 4h 5s 9c"),
    holeCards: {
      p1: parseCards("Ah Kd"),
      p2: parseCards("As Qd"),
      p3: parseCards("Kh Qh"),
    },
    ...overrides,
  };
}

const fullDeck = () =>
  parseCards(
    ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
      .flatMap((rank) => ["c", "d", "h", "s"].map((suit) => `${rank}${suit}`))
      .join(" "),
  );

function realHeadsUp(stacks: readonly [number, number]): TableState {
  return startHand({
    tableId: "real-table",
    handId: "real-hand",
    players: [
      { id: "p1", stack: stacks[0] },
      { id: "p2", stack: stacks[1] },
    ],
    buttonSeat: 0,
    blinds: [5, 10],
    deck: fullDeck(),
  });
}

describe("pots and settlement", () => {
  it("builds only contested pots and refunds unmatched commitments", () => {
    expect(buildPots(playersWithCommitments([50, 100, 200]))).toEqual({
      pots: [
        { amount: 150, eligible: ["p1", "p2", "p3"] },
        { amount: 100, eligible: ["p2", "p3"] },
      ],
      refunds: { p3: 100 },
    });
  });

  it("keeps folded contributions while excluding folded players", () => {
    expect(buildPots(playersWithCommitments([50, 100, 100], ["p1"]))).toEqual({
      pots: [
        { amount: 150, eligible: ["p2", "p3"] },
        { amount: 100, eligible: ["p2", "p3"] },
      ],
      refunds: {},
    });
  });

  it("splits a tied pot and awards the odd chip clockwise left of button", () => {
    const state = showdownState({
      players: playersWithCommitments([5, 5, 5]),
      board: parseCards("2c 3d 4h 5s 9c"),
      holeCards: {
        p1: parseCards("Ah Kd"),
        p2: parseCards("Kh Qd"),
        p3: parseCards("As Qh"),
      },
    });

    const settled = settleShowdown(state);

    expect(settled.players.map((player) => player.stack)).toEqual([7, 0, 8]);
    expect(settled.players.every((player) => player.handCommitted === 0)).toBe(
      true,
    );
  });

  it("settles main and side pots while returning an unmatched overbet", () => {
    const state = showdownState({
      players: playersWithCommitments([50, 100, 200]),
      board: parseCards("2c 3d 4h 9s Tc"),
      holeCards: {
        p1: parseCards("As Ad"),
        p2: parseCards("Ks Kd"),
        p3: parseCards("Qs Qd"),
      },
    });

    expect(settleShowdown(state).players.map((player) => player.stack)).toEqual(
      [150, 100, 100],
    );
  });

  it("awards every contribution to the sole non-folded player", () => {
    const state = showdownState({
      players: playersWithCommitments([20, 30, 30], ["p1", "p2"]),
      board: [],
      holeCards: {},
    });

    expect(settleShowdown(state).players.map((player) => player.stack)).toEqual(
      [0, 0, 80],
    );
  });

  it("runs out flop, turn, and river after a preflop all-in", () => {
    let state = realHeadsUp([10, 10]);
    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;
    const originalDeck = [...state.deck];

    const settled = settleShowdown(state);

    expect(settled.board.map((card) => card.code)).toEqual(
      [
        state.deck[1],
        state.deck[2],
        state.deck[3],
        state.deck[5],
        state.deck[7],
      ].map((card) => card!.code),
    );
    expect(settled.deck).toHaveLength(state.deck.length - 8);
    expect(state.board).toEqual([]);
    expect(state.deck).toEqual(originalDeck);
  });

  it("runs out turn and river after a flop all-in", () => {
    let state = realHeadsUp([20, 20]);
    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "check",
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "bet",
      amount: 10,
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;
    const originalBoard = [...state.board];
    const originalDeck = [...state.deck];

    const settled = settleShowdown(state);

    expect(settled.board.map((card) => card.code)).toEqual([
      ...originalBoard.map((card) => card.code),
      state.deck[1]!.code,
      state.deck[3]!.code,
    ]);
    expect(state.board).toEqual(originalBoard);
    expect(state.deck).toEqual(originalDeck);
  });

  it("runs out the river after a turn all-in", () => {
    let state = realHeadsUp([30, 30]);
    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "check",
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "check",
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "check",
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "bet",
      amount: 20,
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;
    const originalBoard = [...state.board];
    const originalDeck = [...state.deck];

    const settled = settleShowdown(state);

    expect(settled.board.map((card) => card.code)).toEqual([
      ...originalBoard.map((card) => card.code),
      state.deck[1]!.code,
    ]);
    expect(state.board).toEqual(originalBoard);
    expect(state.deck).toEqual(originalDeck);
  });
});
