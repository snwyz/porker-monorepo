/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { applyCommand, type Transition } from "./reducer";
import { validateDeck, type Card } from "./cards";
import type { TablePlayer, TableState } from "./state";

function nextFundedPlayer(
  players: readonly TablePlayer[],
  seat: number,
): TablePlayer | undefined {
  const seatSpan = Math.max(...players.map((player) => player.seat), 0) + 1;
  for (let offset = 1; offset <= seatSpan; offset += 1) {
    const candidate = players.find(
      (player) => player.seat === (seat + offset) % seatSpan,
    );
    if (candidate !== undefined && candidate.stack > 0) return candidate;
  }
  return undefined;
}

export interface AdvanceHandOptions {
  readonly handId: string;
  readonly deck: readonly Card[];
}

export function resolveTimeout(state: TableState): Transition {
  const player = state.players.find(
    (candidate) => candidate.id === state.actorId,
  );
  if (player === undefined) throw new Error("The current actor is not seated");
  return applyCommand(state, {
    type: player.streetCommitted === state.currentBet ? "check" : "fold",
    playerId: player.id,
    expectedVersion: state.version,
  });
}

export function addOn(
  state: TableState,
  playerId: string,
  amount: number,
): TableState {
  if (
    state.phase !== "complete" ||
    state.players.some(
      (player) => player.handCommitted !== 0 || player.streetCommitted !== 0,
    )
  ) {
    throw new Error(
      "Add-ons are permitted only between hands after commitments are settled",
    );
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError("Add-on amount must be a positive integer");
  }
  if (!state.players.some((player) => player.id === playerId)) {
    throw new Error(`Unknown player: ${playerId}`);
  }
  return {
    ...state,
    version: state.version + 1,
    players: state.players.map((player) =>
      player.id === playerId
        ? { ...player, stack: player.stack + amount }
        : player,
    ),
  };
}

export function advanceHand(
  state: TableState,
  options?: AdvanceHandOptions,
): TableState {
  if (state.phase !== "complete") {
    throw new Error("Cannot advance until the current hand is complete");
  }
  if (
    state.players.some(
      (player) => player.handCommitted !== 0 || player.streetCommitted !== 0,
    )
  ) {
    throw new Error("Cannot advance before the current hand is settled");
  }
  if (options === undefined || options.handId.length === 0) {
    throw new Error(
      "Advancing requires an explicit next hand identity and deck",
    );
  }
  if (options.deck.length !== 52) {
    throw new Error("Advancing a hand requires a supplied 52-card deck");
  }
  const deck = validateDeck(options.deck);
  const funded = state.players.filter((player) => player.stack > 0);
  if (funded.length < 2 || funded.length > 9) {
    throw new RangeError("A hand must have between 2 and 9 funded seats");
  }

  const button = nextFundedPlayer(state.players, state.buttonSeat)!;
  const smallBlind =
    funded.length === 2
      ? button
      : nextFundedPlayer(state.players, button.seat)!;
  const bigBlind = nextFundedPlayer(state.players, smallBlind.seat)!;
  const forced = new Map([
    [smallBlind.id, state.smallBlind],
    [bigBlind.id, state.bigBlind],
  ]);
  const players = state.players.map((player) => {
    if (player.stack <= 0) {
      return {
        ...player,
        status: "folded" as const,
        streetCommitted: 0,
        handCommitted: 0,
      };
    }
    const posted = Math.min(player.stack, forced.get(player.id) ?? 0);
    return {
      ...player,
      stack: player.stack - posted,
      streetCommitted: posted,
      handCommitted: posted,
      status:
        player.stack === posted ? ("all-in" as const) : ("active" as const),
    };
  });

  const holeCards: Record<string, ReturnType<typeof validateDeck>> = {};
  for (const player of funded) holeCards[player.id] = Object.freeze([]);
  let dealSeat = nextFundedPlayer(state.players, button.seat)!;
  let dealt = 0;
  for (let round = 0; round < 2; round += 1) {
    for (let count = 0; count < funded.length; count += 1) {
      holeCards[dealSeat.id] = Object.freeze([
        ...holeCards[dealSeat.id]!,
        deck[dealt++]!,
      ]);
      dealSeat = nextFundedPlayer(state.players, dealSeat.seat)!;
    }
  }

  const actor =
    funded.length === 2
      ? button
      : nextFundedPlayer(state.players, bigBlind.seat)!;
  const activePlayers = players.filter((player) => player.status === "active");
  const currentBet = Math.max(
    ...players.map((player) => player.streetCommitted),
  );
  return {
    ...state,
    handId: options.handId,
    phase:
      activePlayers.length === 0 ||
      (activePlayers.length === 1 &&
        activePlayers[0]!.streetCommitted === currentBet)
        ? "complete"
        : "preflop",
    version: state.version + 1,
    buttonSeat: button.seat,
    actorId: actor.id,
    currentBet,
    minimumRaise: state.bigBlind,
    players,
    actedPlayerIds: [],
    raiseRights: activePlayers.map((player) => player.id),
    lastActedBet: {},
    deck: Object.freeze(deck.slice(dealt)),
    board: Object.freeze([]),
    holeCards: Object.freeze(holeCards),
  };
}
