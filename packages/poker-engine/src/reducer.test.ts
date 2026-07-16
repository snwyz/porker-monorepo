/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { describe, expect, it } from "vitest";

import {
  applyCommand,
  applyCommandResult,
  headsUpHand,
  legalActions,
  type CommandErrorCode,
  type TableCommand,
  type TableState,
} from "./index";

function expectRejected(
  state: TableState,
  command: TableCommand,
  code: CommandErrorCode,
) {
  expect(applyCommandResult(state, command)).toEqual({
    ok: false,
    code,
    version: state.version,
  });
}

describe("no-limit betting reducer", () => {
  it("posts blinds and accepts a legal call without mutating input", () => {
    const state = headsUpHand({ stacks: [1000, 1000], blinds: [5, 10] });

    const transition = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    });

    expect(transition.state.players.map((player) => player.stack)).toEqual([
      990, 990,
    ]);
    expect(transition.events.at(-1)?.type).toBe("player-called");
    expect(state.players.map((player) => player.stack)).toEqual([995, 990]);
  });

  it("makes the button post the small blind and act first preflop", () => {
    const state = headsUpHand({ stacks: [100, 100], blinds: [5, 10] });

    expect(state.buttonSeat).toBe(0);
    expect(state.players.map((player) => player.streetCommitted)).toEqual([
      5, 10,
    ]);
    expect(state.actorId).toBe(state.players[0]!.id);
  });

  it("turns an insufficient call into an all-in call", () => {
    const state = headsUpHand({ stacks: [8, 100], blinds: [5, 10] });

    const transition = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    });

    expect(transition.state.players[0]).toMatchObject({
      stack: 0,
      streetCommitted: 8,
      handCommitted: 8,
      status: "all-in",
    });
    expect(transition.events.at(-1)).toMatchObject({
      type: "player-called",
      amount: 3,
    });
  });

  it.each([
    [
      "a raise below the minimum",
      { type: "raise", amount: 15 },
      "INVALID_AMOUNT",
    ],
    ["a check facing a bet", { type: "check" }, "ILLEGAL_ACTION"],
    [
      "a raise beyond the stack",
      { type: "raise", amount: 1001 },
      "INVALID_AMOUNT",
    ],
  ] as const)("rejects %s without changing state", (_, action, code) => {
    const state = headsUpHand({ stacks: [1000, 1000], blinds: [5, 10] });
    const snapshot = structuredClone(state);

    expectRejected(state, { ...action, playerId: state.actorId }, code);
    expect(state).toEqual(snapshot);
  });

  it("rejects the wrong actor and stale versions with typed errors", () => {
    const state = headsUpHand({ stacks: [100, 100], blinds: [5, 10] });

    expectRejected(
      state,
      { type: "fold", playerId: state.players[1]!.id },
      "NOT_ACTOR",
    );
    expectRejected(
      state,
      {
        type: "call",
        playerId: state.actorId,
        expectedVersion: state.version + 1,
      },
      "STALE_VERSION",
    );
  });

  it("enforces a full minimum raise and treats amount as raise-to", () => {
    const state = headsUpHand({ stacks: [100, 100], blinds: [5, 10] });

    const transition = applyCommand(state, {
      type: "raise",
      playerId: state.actorId,
      amount: 20,
    });

    expect(transition.state.currentBet).toBe(20);
    expect(transition.state.minimumRaise).toBe(10);
    expect(transition.state.players[0]).toMatchObject({
      stack: 80,
      streetCommitted: 20,
      handCommitted: 20,
    });
    expect(transition.events.at(-1)).toMatchObject({
      type: "player-raised",
      amount: 20,
    });
  });

  it("allows an incomplete all-in raise without reopening raising", () => {
    let state = headsUpHand({ stacks: [100, 35], blinds: [5, 10] });
    state = applyCommand(state, {
      type: "raise",
      playerId: state.actorId,
      amount: 30,
    }).state;
    state = applyCommand(state, {
      type: "raise",
      playerId: state.actorId,
      amount: 35,
    }).state;

    expect(state.players[1]).toMatchObject({
      stack: 0,
      streetCommitted: 35,
      status: "all-in",
    });
    expect(state.currentBet).toBe(35);
    expect(state.minimumRaise).toBe(20);
    expect(
      legalActions(state, state.actorId).map((action) => action.type),
    ).toEqual(["fold", "call"]);
    expectRejected(
      state,
      { type: "raise", playerId: state.actorId, amount: 60 },
      "ILLEGAL_ACTION",
    );
  });

  it("ends betting after the last active player calls an all-in", () => {
    let state = headsUpHand({ stacks: [100, 35], blinds: [5, 10] });
    state = applyCommand(state, {
      type: "raise",
      playerId: state.actorId,
      amount: 30,
    }).state;
    state = applyCommand(state, {
      type: "raise",
      playerId: state.actorId,
      amount: 35,
    }).state;
    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;

    expect(state.phase).toBe("complete");
  });

  it("completes a street and uses heads-up postflop action order", () => {
    let state = headsUpHand({ stacks: [100, 100], blinds: [5, 10] });
    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "check",
      playerId: state.actorId,
    }).state;

    expect(state).toMatchObject({
      phase: "flop",
      currentBet: 0,
      minimumRaise: 10,
      actorId: state.players[1]!.id,
    });
    expect(state.players.map((player) => player.streetCommitted)).toEqual([
      0, 0,
    ]);
  });

  it("resets the minimum opening bet to the big blind each street", () => {
    let state = headsUpHand({ stacks: [100, 100], blinds: [5, 10] });
    state = applyCommand(state, {
      type: "raise",
      playerId: state.actorId,
      amount: 30,
    }).state;
    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;

    expect(state.phase).toBe("flop");
    expect(state.minimumRaise).toBe(10);
  });

  it("supports postflop bet, call, and fold transitions", () => {
    let state = headsUpHand({ stacks: [100, 100], blinds: [5, 10] });
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
      playerId: state.actorId,
      amount: 10,
    }).state;

    expect(state.currentBet).toBe(10);
    expect(legalActions(state, state.actorId)).toEqual([
      { type: "fold" },
      { type: "call", amount: 10 },
      { type: "raise", minAmount: 20, maxAmount: 90 },
    ]);

    const folded = applyCommand(state, {
      type: "fold",
      playerId: state.actorId,
    });
    expect(folded.state.phase).toBe("complete");
    expect(folded.events.at(-1)?.type).toBe("player-folded");
  });
});
