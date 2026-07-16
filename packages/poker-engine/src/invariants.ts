/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { validateDeck } from "./cards";
import type { TableState } from "./state";

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
    new Set(state.players.map((player) => player.seat)).size !==
    state.players.length
  ) {
    throw new Error("Player seats must be unique");
  }
  if (!state.players.some((player) => player.id === state.actorId)) {
    throw new Error("Actor must be a seated player");
  }
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
  const allCards = [
    ...state.deck,
    ...state.board,
    ...Object.values(state.holeCards).flat(),
  ];
  validateDeck(allCards);
}
