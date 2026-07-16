/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  applyCommand,
  assertInvariants,
  buildPots,
  headsUpHand,
  legalActions,
  type LegalAction,
  type TableCommand,
  type TablePlayer,
} from "./index";

function totalChips(players: readonly TablePlayer[]): number {
  return players.reduce(
    (sum, player) => sum + player.stack + player.handCommitted,
    0,
  );
}

function commandFor(action: LegalAction, playerId: string): TableCommand {
  switch (action.type) {
    case "bet":
      return { type: "bet", amount: action.minAmount, playerId };
    case "raise":
      return { type: "raise", amount: action.minAmount, playerId };
    case "call":
      return { type: "call", playerId };
    case "check":
      return { type: "check", playerId };
    case "fold":
      return { type: "fold", playerId };
  }
}

describe("engine properties", () => {
  it("partitions every commitment into contested pots or refunds", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 500 }), { minLength: 2, maxLength: 9 }),
        (commitments) => {
          const players: TablePlayer[] = commitments.map(
            (handCommitted, seat) => ({
              id: `p${seat}`,
              seat,
              stack: 0,
              streetCommitted: handCommitted,
              handCommitted,
              status: "all-in",
            }),
          );
          const result = buildPots(players);
          expect(
            result.pots.reduce((sum, pot) => sum + pot.amount, 0) +
              Object.values(result.refunds).reduce(
                (sum, refund) => sum + refund,
                0,
              ),
          ).toBe(commitments.reduce((sum, commitment) => sum + commitment, 0));
          expect(result.pots.every((pot) => pot.eligible.length >= 2)).toBe(
            true,
          );
        },
      ),
    );
  });

  it("accepts valid 2-9 player states and rejects negative chips", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 9 }), (count) => {
        const players: TablePlayer[] = Array.from(
          { length: count },
          (_, seat) => ({
            id: `p${seat}`,
            seat,
            stack: 100,
            streetCommitted: 0,
            handCommitted: 0,
            status: "active",
          }),
        );
        expect(() =>
          assertInvariants({
            tableId: "t",
            handId: "h",
            phase: "complete",
            version: 0,
            buttonSeat: 0,
            actorId: "p0",
            currentBet: 0,
            minimumRaise: 10,
            bigBlind: 10,
            players,
            actedPlayerIds: [],
            raiseRights: [],
            lastActedBet: {},
            deck: [],
            board: [],
            holeCards: {},
          }),
        ).not.toThrow();
      }),
    );

    const invalidPlayer: TablePlayer = {
      id: "p1",
      seat: 0,
      stack: -1,
      streetCommitted: 0,
      handCommitted: 0,
      status: "active",
    };
    expect(() =>
      assertInvariants({
        tableId: "t",
        handId: "h",
        phase: "complete",
        version: 0,
        buttonSeat: 0,
        actorId: "p1",
        currentBet: 0,
        minimumRaise: 10,
        bigBlind: 10,
        players: [
          invalidPlayer,
          { ...invalidPlayer, id: "p2", seat: 1, stack: 1 },
        ],
        actedPlayerIds: [],
        raiseRights: [],
        lastActedBet: {},
        deck: [],
        board: [],
        holeCards: {},
      }),
    ).toThrow("non-negative");
  });

  it("conserves chips across every accepted betting command", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 20, max: 1_000 }),
          fc.integer({ min: 20, max: 1_000 }),
        ),
        fc.array(fc.nat(), { maxLength: 40 }),
        (stacks, choices) => {
          let state = headsUpHand({ stacks, blinds: [5, 10] });
          const initial = totalChips(state.players);
          for (const choice of choices) {
            if (state.phase === "complete") break;
            const actions = legalActions(state, state.actorId);
            const action = actions[choice % actions.length]!;
            state = applyCommand(
              state,
              commandFor(action, state.actorId),
            ).state;
            expect(totalChips(state.players)).toBe(initial);
            expect(() => assertInvariants(state)).not.toThrow();
          }
        },
      ),
    );
  });
});
