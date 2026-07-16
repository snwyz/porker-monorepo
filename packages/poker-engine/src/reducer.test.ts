/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { describe, expect, it } from "vitest";

import {
  applyCommand,
  applyCommandResult,
  headsUpHand,
  legalActions,
  parseCards,
  startHand,
  type CommandErrorCode,
  type TableCommand,
  type TableState,
} from "./index";

const fullDeck = () =>
  parseCards(
    ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
      .flatMap((rank) => ["c", "d", "h", "s"].map((suit) => `${rank}${suit}`))
      .join(" "),
  );

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

  it("immediately closes betting when the small blind is forced all-in", () => {
    const state = headsUpHand({ stacks: [5, 100], blinds: [5, 10] });

    expect(state.players[0]!.status).toBe("all-in");
    expect(state.phase).toBe("complete");
    expect(legalActions(state, state.actorId)).toEqual([]);
  });

  it("lets the small blind respond when only the big blind is all-in", () => {
    let state = headsUpHand({ stacks: [100, 10], blinds: [5, 10] });

    expect(state.phase).toBe("preflop");
    expect(state.actorId).toBe(state.players[0]!.id);
    expect(legalActions(state, state.actorId)).toContainEqual({
      type: "call",
      amount: 5,
    });

    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;
    expect(state.phase).toBe("complete");
  });

  it("uses the posted amount when the big blind is short all-in", () => {
    const state = headsUpHand({ stacks: [100, 7], blinds: [5, 10] });

    expect(state.currentBet).toBe(7);
    expect(legalActions(state, state.actorId)).toContainEqual({
      type: "call",
      amount: 2,
    });
  });

  it("immediately closes betting when both blinds are forced all-in", () => {
    const state = headsUpHand({ stacks: [5, 10], blinds: [5, 10] });

    expect(state.players.map((player) => player.status)).toEqual([
      "all-in",
      "all-in",
    ]);
    expect(state.phase).toBe("complete");
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

  it("reopens raising when cumulative short all-ins reach a full raise", () => {
    let state: TableState = {
      tableId: "table-1",
      handId: "hand-1",
      phase: "preflop",
      version: 0,
      buttonSeat: 0,
      actorId: "player-1",
      currentBet: 10,
      minimumRaise: 10,
      bigBlind: 10,
      players: [
        {
          id: "player-1",
          seat: 0,
          stack: 90,
          streetCommitted: 10,
          handCommitted: 10,
          status: "active",
        },
        {
          id: "player-2",
          seat: 1,
          stack: 25,
          streetCommitted: 10,
          handCommitted: 10,
          status: "active",
        },
        {
          id: "player-3",
          seat: 2,
          stack: 40,
          streetCommitted: 10,
          handCommitted: 10,
          status: "active",
        },
      ],
      actedPlayerIds: [],
      raiseRights: ["player-1", "player-2", "player-3"],
      lastActedBet: {},
      deck: [],
      board: [],
      holeCards: {},
    };
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
      type: "raise",
      playerId: state.actorId,
      amount: 50,
    }).state;

    expect(state.currentBet).toBe(50);
    expect(state.minimumRaise).toBe(20);
    expect(legalActions(state, "player-1")).toContainEqual({
      type: "raise",
      minAmount: 70,
      maxAmount: 100,
    });
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

describe("startHand", () => {
  it("posts three-handed blinds and acts left of the big blind", () => {
    const state = startHand({
      tableId: "table-1",
      handId: "hand-1",
      players: [
        { id: "alice", stack: 100 },
        { id: "bob", stack: 100 },
        { id: "carol", stack: 100 },
      ],
      buttonSeat: 0,
      blinds: [5, 10],
      deck: fullDeck(),
    });

    expect(state.players.map((player) => player.streetCommitted)).toEqual([
      0, 5, 10,
    ]);
    expect(state.actorId).toBe("alice");
    expect(state.tableId).toBe("table-1");
    expect(state.handId).toBe("hand-1");
  });

  it.each([1, 10])("rejects a %i-seat hand", (seatCount) => {
    expect(() =>
      startHand({
        tableId: "table-1",
        handId: "hand-1",
        players: Array.from({ length: seatCount }, (_, seat) => ({
          id: `player-${seat + 1}`,
          stack: 100,
        })),
        buttonSeat: 0,
        blinds: [5, 10],
        deck: fullDeck(),
      }),
    ).toThrow("between 2 and 9");
  });

  it("rejects duplicate and incomplete supplied decks", () => {
    const base = {
      tableId: "table-1",
      handId: "hand-1",
      players: [
        { id: "alice", stack: 100 },
        { id: "bob", stack: 100 },
        { id: "carol", stack: 100 },
      ],
      buttonSeat: 0,
      blinds: [5, 10] as const,
    };
    const deck = fullDeck();

    expect(() => startHand({ ...base, deck: deck.slice(0, 51) })).toThrow(
      "exactly 52",
    );
    expect(() =>
      startHand({ ...base, deck: [...deck.slice(0, 51), deck[0]!] }),
    ).toThrow("Duplicate card");
  });

  it("deals hole cards and the flop deterministically from the supplied deck", () => {
    let state = startHand({
      tableId: "table-1",
      handId: "hand-1",
      players: [
        { id: "alice", stack: 100 },
        { id: "bob", stack: 100 },
        { id: "carol", stack: 100 },
      ],
      buttonSeat: 0,
      blinds: [5, 10],
      deck: fullDeck(),
    });

    expect(state.holeCards.alice?.map((card) => card.code)).toEqual([
      "2h",
      "3d",
    ]);
    expect(state.holeCards.bob?.map((card) => card.code)).toEqual(["2c", "2s"]);
    expect(state.holeCards.carol?.map((card) => card.code)).toEqual([
      "2d",
      "3c",
    ]);

    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "call",
      playerId: state.actorId,
    }).state;
    state = applyCommand(state, {
      type: "check",
      playerId: state.actorId,
    }).state;

    expect(state.phase).toBe("flop");
    expect(state.board.map((card) => card.code)).toEqual(["3s", "4c", "4d"]);
    expect(state.deck[0]?.code).toBe("4h");
  });
});
