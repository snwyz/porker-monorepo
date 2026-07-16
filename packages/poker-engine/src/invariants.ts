/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { validateDeck } from "./cards.js";
import type { BettingPhase, TableState } from "./state.js";

const expectedBoardCards: Readonly<
  Record<Exclude<BettingPhase, "complete">, number>
> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
};

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function assertInvariants(state: TableState): void {
  if (state.players.length < 2 || state.players.length > 9) {
    throw new Error("A table state must contain 2-9 players");
  }
  if (
    new Set(state.players.map((player) => player.id)).size !==
    state.players.length
  ) {
    throw new Error("Player ids must be unique");
  }
  if (
    state.players.some(
      (player) => !Number.isInteger(player.seat) || player.seat < 0,
    ) ||
    new Set(state.players.map((player) => player.seat)).size !==
      state.players.length
  ) {
    throw new Error("Player seats must be unique non-negative integers");
  }
  if (!state.players.some((player) => player.seat === state.buttonSeat)) {
    throw new Error("The button must reference a seated player");
  }
  if (
    !positiveInteger(state.smallBlind) ||
    !positiveInteger(state.bigBlind) ||
    state.smallBlind >= state.bigBlind
  ) {
    throw new Error("Small and big blind configuration is invalid");
  }
  if (!positiveInteger(state.minimumRaise)) {
    throw new Error("The minimum raise must be a positive integer");
  }
  if (!Number.isInteger(state.version) || state.version < 0) {
    throw new Error("Version must be a non-negative integer");
  }

  const playerIds = new Set(state.players.map((player) => player.id));
  const actor = state.players.find((player) => player.id === state.actorId);
  if (actor === undefined) throw new Error("Actor must be a seated player");
  for (const player of state.players) {
    if (
      ![player.stack, player.streetCommitted, player.handCommitted].every(
        (chips) => Number.isInteger(chips) && chips >= 0,
      )
    ) {
      throw new Error("Stacks and commitments must be non-negative integers");
    }
    if (player.streetCommitted > player.handCommitted) {
      throw new Error("Street commitment cannot exceed hand commitment");
    }
    if (player.status === "active" && player.stack === 0) {
      throw new Error("An active player must have chips");
    }
    if (player.status === "all-in" && player.stack !== 0) {
      throw new Error("An all-in player cannot retain chips");
    }
  }
  if (
    state.phase !== "complete" &&
    (actor.status !== "active" || actor.stack === 0)
  ) {
    throw new Error("The actor must be eligible in a live phase");
  }

  if (!Number.isInteger(state.currentBet) || state.currentBet < 0) {
    throw new Error("Current bet must be a non-negative integer");
  }
  if (
    state.currentBet <
    Math.max(...state.players.map((player) => player.streetCommitted))
  ) {
    throw new Error("Current bet cannot trail a player commitment");
  }
  for (const id of [
    ...state.actedPlayerIds,
    ...state.raiseRights,
    ...Object.keys(state.lastActedBet),
  ]) {
    if (!playerIds.has(id))
      throw new Error("Betting metadata has unknown ownership");
  }
  if (
    Object.values(state.lastActedBet).some(
      (chips) => !Number.isInteger(chips) || chips < 0,
    )
  ) {
    throw new Error("Betting metadata chips must be non-negative integers");
  }

  const validBoardCount =
    state.phase === "complete"
      ? [0, 3, 4, 5].includes(state.board.length)
      : state.board.length === expectedBoardCards[state.phase];
  if (!validBoardCount) {
    throw new Error(`Invalid board count for ${state.phase}`);
  }

  for (const [id, cards] of Object.entries(state.holeCards)) {
    if (!playerIds.has(id)) throw new Error("Invalid hole-card ownership");
    if (cards.length !== 2) throw new Error("Players must own two hole cards");
  }
  const cardBackedState =
    state.deck.length > 0 ||
    state.board.length > 0 ||
    Object.keys(state.holeCards).length > 0;
  if (cardBackedState) {
    for (const player of state.players) {
      const participated =
        player.stack > 0 ||
        player.handCommitted > 0 ||
        player.status !== "folded";
      if (participated && state.holeCards[player.id]?.length !== 2) {
        throw new Error("Every participating player must own two hole cards");
      }
    }
  }

  validateDeck([
    ...state.deck,
    ...state.board,
    ...Object.values(state.holeCards).flat(),
  ]);
}
