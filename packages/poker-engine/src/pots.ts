/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { compareHands, evaluateSeven, type HandScore } from "./evaluator";
import type { TablePlayer, TableState } from "./state";

export interface Pot {
  readonly amount: number;
  readonly eligible: readonly string[];
}

export interface PotBuildResult {
  readonly pots: readonly Pot[];
  readonly refunds: Readonly<Record<string, number>>;
}

export function buildPots(players: readonly TablePlayer[]): PotBuildResult {
  const levels = [...new Set(players.map((player) => player.handCommitted))]
    .filter((commitment) => commitment > 0)
    .sort((a, b) => a - b);
  const pots: Pot[] = [];
  const refunds: Record<string, number> = {};
  let previous = 0;

  for (const level of levels) {
    const contributors = players.filter(
      (player) => player.handCommitted >= level,
    );
    const amount = (level - previous) * contributors.length;
    if (contributors.length === 1) {
      const contributor = contributors[0]!;
      refunds[contributor.id] = (refunds[contributor.id] ?? 0) + amount;
    } else {
      pots.push({
        amount,
        eligible: contributors
          .filter((player) => player.status !== "folded")
          .map((player) => player.id),
      });
    }
    previous = level;
  }

  return { pots, refunds };
}

function clockwiseFromLeftOfButton(
  players: readonly TablePlayer[],
  buttonSeat: number,
  ids: readonly string[],
): string[] {
  const seatById = new Map(players.map((player) => [player.id, player.seat]));
  const seatSpan = Math.max(...players.map((player) => player.seat), 0) + 1;
  return [...ids].sort((left, right) => {
    const leftDistance =
      ((seatById.get(left) ?? buttonSeat) - buttonSeat + seatSpan) % seatSpan ||
      seatSpan;
    const rightDistance =
      ((seatById.get(right) ?? buttonSeat) - buttonSeat + seatSpan) %
        seatSpan || seatSpan;
    return leftDistance - rightDistance;
  });
}

function bestIds(
  state: TableState,
  eligible: readonly string[],
): readonly string[] {
  let best: HandScore | undefined;
  let winners: string[] = [];
  for (const id of eligible) {
    const holeCards = state.holeCards[id];
    if (
      holeCards === undefined ||
      holeCards.length !== 2 ||
      state.board.length !== 5
    ) {
      throw new Error(`Cannot evaluate showdown cards for ${id}`);
    }
    const score = evaluateSeven([...holeCards, ...state.board]);
    const comparison = best === undefined ? 1 : compareHands(score, best);
    if (comparison > 0) {
      best = score;
      winners = [id];
    } else if (comparison === 0) {
      winners.push(id);
    }
  }
  return winners;
}

export function settleShowdown(state: TableState): TableState {
  if (state.phase !== "complete") {
    throw new Error("Showdown settlement requires a complete hand");
  }
  const contenders = state.players.filter(
    (player) => player.status !== "folded",
  );
  const payouts: Record<string, number> = {};

  if (contenders.length === 1) {
    payouts[contenders[0]!.id] = state.players.reduce(
      (sum, player) => sum + player.handCommitted,
      0,
    );
  } else {
    const { pots, refunds } = buildPots(state.players);
    Object.assign(payouts, refunds);
    for (const pot of pots) {
      if (pot.eligible.length === 0) {
        throw new Error("A contested pot has no eligible player");
      }
      const winners =
        pot.eligible.length === 1 ? pot.eligible : bestIds(state, pot.eligible);
      const share = Math.floor(pot.amount / winners.length);
      for (const winner of winners) {
        payouts[winner] = (payouts[winner] ?? 0) + share;
      }
      const oddChipOrder = clockwiseFromLeftOfButton(
        state.players,
        state.buttonSeat,
        winners,
      );
      for (let chip = 0; chip < pot.amount % winners.length; chip += 1) {
        const winner = oddChipOrder[chip]!;
        payouts[winner] = (payouts[winner] ?? 0) + 1;
      }
    }
  }

  return {
    ...state,
    version: state.version + 1,
    currentBet: 0,
    actedPlayerIds: [],
    raiseRights: [],
    lastActedBet: {},
    players: state.players.map((player) => ({
      ...player,
      stack: player.stack + (payouts[player.id] ?? 0),
      streetCommitted: 0,
      handCommitted: 0,
    })),
  };
}
