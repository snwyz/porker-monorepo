/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { describe, expect, it } from "vitest";

import {
  addOn,
  applyCommand,
  advanceHand,
  assertInvariants,
  headsUpHand,
  parseCards,
  resolveTimeout,
  settleShowdown,
  startHand,
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

    const unsettled = { ...live, phase: "complete" as const };
    expect(() => addOn(unsettled, unsettled.players[0]!.id, 50)).toThrow(
      "settled",
    );

    const complete = settleShowdown({
      ...unsettled,
      players: unsettled.players.map((player, index) =>
        index === 1 ? { ...player, status: "folded" as const } : player,
      ),
    });
    expect(addOn(complete, complete.players[0]!.id, 50).players[0]!.stack).toBe(
      complete.players[0]!.stack + 50,
    );
  });

  it("advances an actually played and settled hand with explicit identity and deck", () => {
    let state = startHand({
      tableId: "table-real",
      handId: "opaque-current",
      players: [
        { id: "p1", stack: 100 },
        { id: "p2", stack: 100 },
      ],
      buttonSeat: 0,
      blinds: [3, 10],
      deck: fullDeck(),
    });
    state = applyCommand(state, {
      type: "fold",
      playerId: state.actorId,
    }).state;
    const settled = settleShowdown(state);
    expect(settled.deck.length).toBeLessThan(52);

    const nextDeck = [...fullDeck()].reverse();
    const next = advanceHand(settled, {
      handId: "opaque-next",
      deck: nextDeck,
    });

    expect(next.handId).toBe("opaque-next");
    expect(next.smallBlind).toBe(3);
    expect(next.players.map((player) => player.streetCommitted)).toEqual([
      10, 3,
    ]);
    expect(nextDeck).toHaveLength(52);
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
      smallBlind: 5,
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

    const next = advanceHand(state, { handId: "hand-2", deck: fullDeck() });

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
    ).toThrow("next hand identity");
  });

  it("rejects a complete hand with uncleared street commitments", () => {
    const live = headsUpHand({ stacks: [100, 100], blinds: [5, 10] });
    const incompleteSettlement = {
      ...live,
      phase: "complete" as const,
      players: live.players.map((player, index) => ({
        ...player,
        streetCommitted: index === 0 ? 1 : 0,
        handCommitted: 0,
      })),
    };

    expect(() =>
      advanceHand(incompleteSettlement, {
        handId: "next",
        deck: fullDeck(),
      }),
    ).toThrow("settled");
  });

  it("reactivates a busted player who adds on between hands", () => {
    const dealt = headsUpHand({ stacks: [100, 10], blinds: [5, 10] });
    const settled: TableState = {
      ...dealt,
      phase: "complete",
      currentBet: 0,
      players: dealt.players.map((player) => ({
        ...player,
        streetCommitted: 0,
        handCommitted: 0,
      })),
    };
    expect(() => assertInvariants(settled)).not.toThrow();
    const otherPlayer = settled.players[0];

    const next = addOn(settled, settled.players[1]!.id, 50);

    expect(next.players[1]).toMatchObject({ stack: 50, status: "active" });
    expect(next.players[0]).toEqual(otherPlayer);
    expect(
      next.players.every(
        (player) => player.streetCommitted === 0 && player.handCommitted === 0,
      ),
    ).toBe(true);
    expect(() => assertInvariants(next)).not.toThrow();
  });
});
