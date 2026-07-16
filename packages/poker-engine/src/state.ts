export type BettingPhase = "preflop" | "flop" | "turn" | "river" | "complete";

export type PlayerStatus = "active" | "folded" | "all-in";

export interface TablePlayer {
  readonly id: string;
  readonly seat: number;
  readonly stack: number;
  readonly streetCommitted: number;
  readonly handCommitted: number;
  readonly status: PlayerStatus;
}

export interface TableState {
  readonly phase: BettingPhase;
  readonly version: number;
  readonly buttonSeat: number;
  readonly actorId: string;
  readonly currentBet: number;
  readonly minimumRaise: number;
  readonly bigBlind: number;
  readonly players: readonly TablePlayer[];
  /** Players who have acted since the last full raise. */
  readonly actedPlayerIds: readonly string[];
  /** Active players whose right to make a raise is currently open. */
  readonly raiseRights: readonly string[];
}

export interface HeadsUpHandOptions {
  readonly stacks: readonly [number, number];
  readonly blinds: readonly [number, number];
}

export function headsUpHand(options: HeadsUpHandOptions): TableState {
  const [smallBlind, bigBlind] = options.blinds;
  if (
    !Number.isInteger(smallBlind) ||
    !Number.isInteger(bigBlind) ||
    smallBlind <= 0 ||
    bigBlind <= smallBlind ||
    options.stacks.some((stack) => !Number.isInteger(stack) || stack <= 0)
  ) {
    throw new RangeError("Stacks and blinds must be positive integers");
  }
  const commitments = [smallBlind, bigBlind] as const;
  const players = options.stacks.map((stack, seat) => ({
    id: `player-${seat + 1}`,
    seat,
    stack: Math.max(0, stack - commitments[seat]!),
    streetCommitted: Math.min(stack, commitments[seat]!),
    handCommitted: Math.min(stack, commitments[seat]!),
    status:
      stack <= commitments[seat]! ? ("all-in" as const) : ("active" as const),
  }));

  return {
    phase: "preflop",
    version: 0,
    buttonSeat: 0,
    actorId: players[0]!.id,
    currentBet: bigBlind,
    minimumRaise: bigBlind,
    bigBlind,
    players,
    actedPlayerIds: [],
    raiseRights: players
      .filter((player) => player.status === "active")
      .map((player) => player.id),
  };
}
