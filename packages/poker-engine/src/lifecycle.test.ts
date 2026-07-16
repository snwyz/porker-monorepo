/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { describe, expect, it } from "vitest";

import {
  addOn,
  advanceHand,
  headsUpHand,
  parseCards,
  resolveTimeout,
  type TableState,
} from "./index";

const fullDeck = () =>
  parseCards(
    ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
      .flatMap((rank) => ["c", "d", "h", "s"].map((suit) => `${rank}${suit}`))
      .join(" "),
  );

describe("table lifecycle", () => {
  it("auto-checks when no call is owed and auto-folds when facing a bet", () => {
    let checked = headsUpHand({ stacks: [100, 100], blinds: [5, 10] });
    checked = {
      ...checked,
      currentBet: checked.players[0]!.streetCommitted,
    };
    expect(resolveTimeout(checked).events[0]).toMatchObject({
      type: "player-checked",
    });

    const folded = resolveTimeout(
      headsUpHand({ stacks: [100, 100], blinds: [5, 10] }),
    );
    expect(folded.events[0]).toMatchObject({ type: "player-folded" });
  });

  it("permits add-ons only between hands", () => {
    const live = headsUpHand({ stacks: [100, 100], blinds: [5, 10] });
    expect(() => addOn(live, live.players[0]!.id, 50)).toThrow("between hands");

    const complete = { ...live, phase: "complete" as const };
    expect(addOn(complete, complete.players[0]!.id, 50).players[0]!.stack).toBe(
      145,
    );
  });

  it("rotates button and blinds across seats with chips", () => {
    const state: TableState = {
      tableId: "table-1",
      handId: "hand-1",
      phase: "complete",
      version: 8,
      buttonSeat: 0,
      actorId: "p1",
      currentBet: 0,
      minimumRaise: 10,
      bigBlind: 10,
      players: [
        {
          id: "p1",
          seat: 0,
          stack: 100,
          streetCommitted: 0,
          handCommitted: 0,
          status: "active",
        },
        {
          id: "p2",
          seat: 1,
          stack: 0,
          streetCommitted: 0,
          handCommitted: 0,
          status: "all-in",
        },
        {
          id: "p3",
          seat: 2,
          stack: 100,
          streetCommitted: 0,
          handCommitted: 0,
          status: "active",
        },
      ],
      actedPlayerIds: [],
      raiseRights: [],
      lastActedBet: {},
      deck: fullDeck(),
      board: [],
      holeCards: {},
    };

    const next = advanceHand(state);

    expect(next.buttonSeat).toBe(2);
    expect(next.players.map((player) => player.streetCommitted)).toEqual([
      10, 0, 5,
    ]);
    expect(next.actorId).toBe("p3");
    expect(next.handId).toBe("hand-2");
  });

  it("requires a complete settled hand and a full supplied next deck", () => {
    const live = headsUpHand({ stacks: [100, 100], blinds: [5, 10] });
    expect(() => advanceHand(live)).toThrow("complete");
    expect(() =>
      advanceHand({
        ...live,
        phase: "complete",
        currentBet: 0,
        players: live.players.map((player) => ({
          ...player,
          streetCommitted: 0,
          handCommitted: 0,
        })),
      }),
    ).toThrow("52-card");
  });
});
