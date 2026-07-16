/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import type { GameEvent, LegalAction, TableCommand } from "./commands";
import type { BettingPhase, TablePlayer, TableState } from "./state";

export interface Transition {
  readonly state: TableState;
  readonly events: readonly GameEvent[];
}

export type CommandErrorCode =
  "NOT_ACTOR" | "STALE_VERSION" | "ILLEGAL_ACTION" | "INVALID_AMOUNT";

export type CommandResult =
  | { readonly ok: true; readonly transition: Transition }
  | {
      readonly ok: false;
      readonly code: CommandErrorCode;
      readonly version: number;
    };

export class CommandError extends Error {
  readonly version: number;

  constructor(
    readonly code: CommandErrorCode,
    version: number,
  ) {
    super(code);
    this.name = "CommandError";
    this.version = version;
  }
}

function rejected(state: TableState, code: CommandErrorCode): CommandResult {
  return { ok: false, code, version: state.version };
}

function nextPhase(phase: BettingPhase): BettingPhase {
  switch (phase) {
    case "preflop":
      return "flop";
    case "flop":
      return "turn";
    case "turn":
      return "river";
    default:
      return "complete";
  }
}

function nextActivePlayer(
  players: readonly TablePlayer[],
  seat: number,
): TablePlayer | undefined {
  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = players[(seat + offset) % players.length];
    if (candidate?.status === "active" && candidate.stack > 0) return candidate;
  }
  return undefined;
}

function addUnique(values: readonly string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function finishOrPassAction(
  state: TableState,
  players: readonly TablePlayer[],
  actingSeat: number,
  actedPlayerIds: readonly string[],
  raiseRights: readonly string[],
  events: readonly GameEvent[],
): Transition {
  const contenders = players.filter((player) => player.status !== "folded");
  if (contenders.length <= 1) {
    return {
      state: {
        ...state,
        version: state.version + 1,
        phase: "complete",
        players,
        actedPlayerIds,
        raiseRights: [],
      },
      events,
    };
  }

  const active = players.filter((player) => player.status === "active");
  if (
    active.length <= 1 &&
    active.every((player) => player.streetCommitted === state.currentBet)
  ) {
    return {
      state: {
        ...state,
        version: state.version + 1,
        phase: "complete",
        players,
        actedPlayerIds,
        raiseRights: [],
      },
      events,
    };
  }
  const streetClosed =
    active.length > 1 &&
    active.every(
      (player) =>
        actedPlayerIds.includes(player.id) &&
        player.streetCommitted === state.currentBet,
    );

  if (streetClosed) {
    const phase = nextPhase(state.phase);
    const resetPlayers = players.map((player) => ({
      ...player,
      streetCommitted: 0,
    }));
    const firstPostflop = nextActivePlayer(resetPlayers, state.buttonSeat);
    return {
      state: {
        ...state,
        version: state.version + 1,
        phase,
        actorId: firstPostflop?.id ?? state.actorId,
        currentBet: 0,
        minimumRaise: state.bigBlind,
        players: resetPlayers,
        actedPlayerIds: [],
        raiseRights: resetPlayers
          .filter((player) => player.status === "active")
          .map((player) => player.id),
      },
      events: [...events, { type: "street-completed", phase }],
    };
  }

  const nextActor = nextActivePlayer(players, actingSeat);
  return {
    state: {
      ...state,
      version: state.version + 1,
      actorId: nextActor?.id ?? state.actorId,
      players,
      actedPlayerIds,
      raiseRights,
    },
    events,
  };
}

function amountError(
  state: TableState,
  player: TablePlayer,
  command: Extract<TableCommand, { type: "bet" | "raise" }>,
): CommandErrorCode | undefined {
  if (!Number.isInteger(command.amount) || command.amount <= 0) {
    return "INVALID_AMOUNT";
  }
  const maximum = player.streetCommitted + player.stack;
  if (command.amount > maximum) return "INVALID_AMOUNT";

  if (command.type === "bet") {
    if (state.currentBet !== 0) return "ILLEGAL_ACTION";
    if (command.amount < state.minimumRaise && command.amount !== maximum) {
      return "INVALID_AMOUNT";
    }
    return undefined;
  }

  if (state.currentBet === 0 || command.amount <= state.currentBet) {
    return "ILLEGAL_ACTION";
  }
  if (!state.raiseRights.includes(player.id)) return "ILLEGAL_ACTION";
  const raiseSize = command.amount - state.currentBet;
  if (raiseSize < state.minimumRaise && command.amount !== maximum) {
    return "INVALID_AMOUNT";
  }
  return undefined;
}

export function applyCommandResult(
  state: TableState,
  command: TableCommand,
): CommandResult {
  if (
    command.expectedVersion !== undefined &&
    command.expectedVersion !== state.version
  ) {
    return rejected(state, "STALE_VERSION");
  }
  if (command.playerId !== state.actorId) return rejected(state, "NOT_ACTOR");
  const playerIndex = state.players.findIndex(
    (player) => player.id === command.playerId,
  );
  const player = state.players[playerIndex];
  if (!player || player.status !== "active" || state.phase === "complete") {
    return rejected(state, "ILLEGAL_ACTION");
  }

  const toCall = Math.max(0, state.currentBet - player.streetCommitted);
  if (command.type === "check" && toCall !== 0) {
    return rejected(state, "ILLEGAL_ACTION");
  }
  if (command.type === "call" && toCall === 0) {
    return rejected(state, "ILLEGAL_ACTION");
  }
  if (command.type === "bet" || command.type === "raise") {
    const error = amountError(state, player, command);
    if (error) return rejected(state, error);
  }

  let players: readonly TablePlayer[] = state.players;
  let actedPlayerIds = addUnique(state.actedPlayerIds, player.id);
  let raiseRights = state.raiseRights.filter((id) => id !== player.id);
  let currentBet = state.currentBet;
  let minimumRaise = state.minimumRaise;
  let event: GameEvent;

  if (command.type === "fold") {
    players = state.players.map((candidate, index) =>
      index === playerIndex ? { ...candidate, status: "folded" } : candidate,
    );
    event = { type: "player-folded", playerId: player.id };
  } else if (command.type === "check") {
    event = { type: "player-checked", playerId: player.id };
  } else if (command.type === "call") {
    const paid = Math.min(toCall, player.stack);
    players = state.players.map((candidate, index) =>
      index === playerIndex
        ? {
            ...candidate,
            stack: candidate.stack - paid,
            streetCommitted: candidate.streetCommitted + paid,
            handCommitted: candidate.handCommitted + paid,
            status:
              candidate.stack === paid ? ("all-in" as const) : candidate.status,
          }
        : candidate,
    );
    event = { type: "player-called", playerId: player.id, amount: paid };
  } else {
    const paid = command.amount - player.streetCommitted;
    const raiseSize = command.amount - state.currentBet;
    const fullRaise =
      command.type === "bet"
        ? command.amount >= state.minimumRaise
        : raiseSize >= state.minimumRaise;
    players = state.players.map((candidate, index) =>
      index === playerIndex
        ? {
            ...candidate,
            stack: candidate.stack - paid,
            streetCommitted: command.amount,
            handCommitted: candidate.handCommitted + paid,
            status:
              candidate.stack === paid ? ("all-in" as const) : candidate.status,
          }
        : candidate,
    );
    currentBet = command.amount;
    if (fullRaise) {
      minimumRaise = command.type === "bet" ? command.amount : raiseSize;
      actedPlayerIds = [player.id];
      raiseRights = players
        .filter(
          (candidate) =>
            candidate.status === "active" && candidate.id !== player.id,
        )
        .map((candidate) => candidate.id);
    }
    event =
      command.type === "bet"
        ? { type: "player-bet", playerId: player.id, amount: command.amount }
        : {
            type: "player-raised",
            playerId: player.id,
            amount: command.amount,
            fullRaise,
          };
  }

  const transition = finishOrPassAction(
    { ...state, currentBet, minimumRaise },
    players,
    player.seat,
    actedPlayerIds,
    raiseRights,
    [event],
  );
  return { ok: true, transition };
}

export function applyCommand(
  state: TableState,
  command: TableCommand,
): Transition {
  const result = applyCommandResult(state, command);
  if (!result.ok) throw new CommandError(result.code, result.version);
  return result.transition;
}

export function legalActions(
  state: TableState,
  playerId: string,
): LegalAction[] {
  if (playerId !== state.actorId || state.phase === "complete") return [];
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.status !== "active") return [];

  const actions: LegalAction[] = [];
  const toCall = Math.max(0, state.currentBet - player.streetCommitted);
  const maximum = player.streetCommitted + player.stack;
  if (toCall > 0) {
    actions.push(
      { type: "fold" },
      { type: "call", amount: Math.min(toCall, player.stack) },
    );
  } else {
    actions.push({ type: "check" });
  }

  if (state.currentBet === 0 && maximum > 0) {
    actions.push({
      type: "bet",
      minAmount: Math.min(state.minimumRaise, maximum),
      maxAmount: maximum,
    });
  } else if (
    state.raiseRights.includes(player.id) &&
    maximum > state.currentBet
  ) {
    actions.push({
      type: "raise",
      minAmount: Math.min(state.currentBet + state.minimumRaise, maximum),
      maxAmount: maximum,
    });
  }
  return actions;
}
