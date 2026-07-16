/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  applyCommand,
  advanceHand,
  assertInvariants,
  buildPots,
  legalActions,
  parseCards,
  settleShowdown,
  startHand,
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

const fullDeck = () =>
  parseCards(
    ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]
      .flatMap((rank) => ["c", "d", "h", "s"].map((suit) => `${rank}${suit}`))
      .join(" "),
  );

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

  it("accepts real valid states with 2-9 players", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 9 }), (count) => {
        expect(() =>
          assertInvariants(
            startHand({
              tableId: "t",
              handId: "h",
              buttonSeat: 0,
              blinds: [5, 10],
              players: Array.from({ length: count }, (_, seat) => ({
                id: `p${seat}`,
                stack: 100,
              })),
              deck: fullDeck(),
            }),
          ),
        ).not.toThrow();
      }),
    );
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
          let state = startHand({
            tableId: "commands",
            handId: "commands-hand",
            players: [
              { id: "p1", stack: stacks[0] },
              { id: "p2", stack: stacks[1] },
            ],
            buttonSeat: 0,
            blinds: [5, 10],
            deck: fullDeck(),
          });
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

  it("conserves 2-9 player chips through pot/refund settlement", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 500 }), { minLength: 2, maxLength: 9 }),
        (commitments) => {
          const cards = fullDeck();
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
          const state = {
            tableId: "settlement-property",
            handId: "settlement-hand",
            phase: "complete" as const,
            version: 0,
            buttonSeat: 0,
            actorId: "p0",
            currentBet: Math.max(...commitments),
            minimumRaise: 10,
            smallBlind: 5,
            bigBlind: 10,
            players,
            actedPlayerIds: [],
            raiseRights: [],
            lastActedBet: {},
            board: cards.slice(0, 5),
            holeCards: Object.fromEntries(
              players.map((player, index) => [
                player.id,
                cards.slice(5 + index * 2, 7 + index * 2),
              ]),
            ),
            deck: cards.slice(5 + players.length * 2),
          };
          const initial = totalChips(players);

          const settled = settleShowdown(state);

          expect(totalChips(settled.players)).toBe(initial);
          expect(() => assertInvariants(settled)).not.toThrow();
        },
      ),
    );
  });

  it("conserves chips and rotates the button across 2-9 player hands", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 9 }),
        fc.nat(),
        (count, rawButton) => {
          const buttonSeat = rawButton % count;
          let state = startHand({
            tableId: "rotation-property",
            handId: "current",
            players: Array.from({ length: count }, (_, seat) => ({
              id: `p${seat}`,
              stack: 100,
            })),
            buttonSeat,
            blinds: [5, 10],
            deck: fullDeck(),
          });
          const initial = totalChips(state.players);
          while (state.phase !== "complete") {
            state = applyCommand(state, {
              type: "fold",
              playerId: state.actorId,
            }).state;
          }
          const settled = settleShowdown(state);

          const next = advanceHand(settled, {
            handId: "explicit-next",
            deck: [...fullDeck()].reverse(),
          });

          expect(next.buttonSeat).toBe((buttonSeat + 1) % count);
          expect(next.handId).toBe("explicit-next");
          expect(totalChips(next.players)).toBe(initial);
          expect(() => assertInvariants(next)).not.toThrow();
        },
      ),
    );
  });
});
