import { validateDeck, type Card, type Deck } from "./cards";

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
  readonly tableId: string;
  readonly handId: string;
  readonly phase: BettingPhase;
  readonly version: number;
  readonly buttonSeat: number;
  readonly actorId: string;
  readonly currentBet: number;
  readonly minimumRaise: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly players: readonly TablePlayer[];
  /** Players who have acted since the last full raise. */
  readonly actedPlayerIds: readonly string[];
  /** Active players whose right to make a raise is currently open. */
  readonly raiseRights: readonly string[];
  /** Wager level each player faced when they most recently acted this street. */
  readonly lastActedBet: Readonly<Record<string, number>>;
  readonly deck: Deck;
  readonly board: readonly Card[];
  readonly holeCards: Readonly<Record<string, readonly Card[]>>;
}

export interface HeadsUpHandOptions {
  readonly stacks: readonly [number, number];
  readonly blinds: readonly [number, number];
}

export interface HandPlayerInput {
  readonly id: string;
  readonly stack: number;
}

export interface StartHandOptions {
  readonly tableId: string;
  readonly handId: string;
  readonly players: readonly HandPlayerInput[];
  readonly buttonSeat: number;
  readonly blinds: readonly [number, number];
  readonly deck: readonly Card[];
}

function validateBlindsAndStacks(
  stacks: readonly number[],
  blinds: readonly [number, number],
): void {
  const [smallBlind, bigBlind] = blinds;
  if (
    !Number.isInteger(smallBlind) ||
    !Number.isInteger(bigBlind) ||
    smallBlind <= 0 ||
    bigBlind <= smallBlind ||
    stacks.some((stack) => !Number.isInteger(stack) || stack <= 0)
  ) {
    throw new RangeError("Stacks and blinds must be positive integers");
  }
}

function seatAfter(seat: number, playerCount: number): number {
  return (seat + 1) % playerCount;
}

export function startHand(options: StartHandOptions): TableState {
  const playerCount = options.players.length;
  if (playerCount < 2 || playerCount > 9) {
    throw new RangeError("A hand must have between 2 and 9 seats");
  }
  if (
    !Number.isInteger(options.buttonSeat) ||
    options.buttonSeat < 0 ||
    options.buttonSeat >= playerCount
  ) {
    throw new RangeError("Button seat is outside the table");
  }
  if (
    new Set(options.players.map((player) => player.id)).size !== playerCount
  ) {
    throw new Error("Player ids must be unique");
  }
  validateBlindsAndStacks(
    options.players.map((player) => player.stack),
    options.blinds,
  );
  if (options.deck.length !== 52) {
    throw new RangeError("A supplied deck must contain exactly 52 cards");
  }
  const validatedDeck = validateDeck(options.deck);

  const dealOrder: number[] = [];
  let dealSeat = seatAfter(options.buttonSeat, playerCount);
  for (let round = 0; round < 2; round += 1) {
    for (let dealt = 0; dealt < playerCount; dealt += 1) {
      dealOrder.push(dealSeat);
      dealSeat = seatAfter(dealSeat, playerCount);
    }
  }
  const mutableHoleCards = Object.fromEntries(
    options.players.map((player) => [player.id, [] as Card[]]),
  );
  dealOrder.forEach((seat, index) => {
    mutableHoleCards[options.players[seat]!.id]!.push(validatedDeck[index]!);
  });
  const holeCards = Object.freeze(
    Object.fromEntries(
      Object.entries(mutableHoleCards).map(([id, cards]) => [
        id,
        Object.freeze(cards),
      ]),
    ),
  );
  const deck = Object.freeze(validatedDeck.slice(playerCount * 2));

  const smallBlindSeat =
    playerCount === 2
      ? options.buttonSeat
      : seatAfter(options.buttonSeat, playerCount);
  const bigBlindSeat = seatAfter(smallBlindSeat, playerCount);
  const [smallBlind, bigBlind] = options.blinds;
  const players = options.players.map((input, seat) => {
    const forced =
      seat === smallBlindSeat
        ? smallBlind
        : seat === bigBlindSeat
          ? bigBlind
          : 0;
    const posted = Math.min(input.stack, forced);
    return {
      id: input.id,
      seat,
      stack: input.stack - posted,
      streetCommitted: posted,
      handCommitted: posted,
      status:
        input.stack === posted ? ("all-in" as const) : ("active" as const),
    };
  });
  const currentBet = Math.max(
    ...players.map((player) => player.streetCommitted),
  );
  const activePlayers = players.filter((player) => player.status === "active");
  const firstSeat =
    playerCount === 2
      ? options.buttonSeat
      : seatAfter(bigBlindSeat, playerCount);
  let actor = players[firstSeat];
  for (
    let offset = 0;
    offset < playerCount && actor?.status !== "active";
    offset += 1
  ) {
    actor = players[seatAfter(actor?.seat ?? firstSeat, playerCount)];
  }
  const bettingComplete =
    activePlayers.length === 0 ||
    actor === undefined ||
    (activePlayers.length === 1 && actor.streetCommitted === currentBet);

  return {
    tableId: options.tableId,
    handId: options.handId,
    phase: bettingComplete ? "complete" : "preflop",
    version: 0,
    buttonSeat: options.buttonSeat,
    actorId: (actor ?? players[0])!.id,
    currentBet,
    minimumRaise: bigBlind,
    smallBlind,
    bigBlind,
    players,
    actedPlayerIds: [],
    raiseRights: activePlayers.map((player) => player.id),
    lastActedBet: {},
    deck,
    board: Object.freeze([]),
    holeCards,
  };
}

export function headsUpHand(options: HeadsUpHandOptions): TableState {
  const [smallBlind, bigBlind] = options.blinds;
  validateBlindsAndStacks(options.stacks, options.blinds);
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
  const currentBet = Math.max(
    ...players.map((player) => player.streetCommitted),
  );
  const activePlayers = players.filter((player) => player.status === "active");
  const actor = activePlayers.find(
    (player) => player.streetCommitted < currentBet,
  );
  const bettingComplete = activePlayers.length === 0 || actor === undefined;

  return {
    tableId: "heads-up-test-table",
    handId: "heads-up-test-hand",
    phase: bettingComplete ? "complete" : "preflop",
    version: 0,
    buttonSeat: 0,
    actorId: (actor ?? activePlayers[0] ?? players[0])!.id,
    currentBet,
    minimumRaise: bigBlind,
    smallBlind,
    bigBlind,
    players,
    actedPlayerIds: [],
    raiseRights: players
      .filter((player) => player.status === "active")
      .map((player) => player.id),
    lastActedBet: {},
    deck: Object.freeze([]),
    board: Object.freeze([]),
    holeCards: Object.freeze({}),
  };
}
