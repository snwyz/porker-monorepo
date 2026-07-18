"use client";

import {
  PokerTable,
  type TableViewModel,
} from "@/components/poker/poker-table";

const nineSeatFixture: TableViewModel = {
  tableId: "responsive-nine-seat-table",
  handId: "responsive-nine-seat-hand",
  phase: "turn",
  version: 12,
  viewerId: "player-0",
  actorId: "player-0",
  currentBet: 80,
  minimumRaise: 40,
  seatCount: 9,
  buttonSeat: 5,
  players: Array.from({ length: 9 }, (_, seat) => ({
    id: `player-${seat}`,
    displayName: seat === 0 ? "You" : `Player ${seat + 1}`,
    seat,
    stack: 1000 - seat * 45,
    streetCommitted: seat % 3 === 0 ? 80 : 40,
    handCommitted: 120 + seat * 20,
    status: seat === 7 ? ("all-in" as const) : ("active" as const),
  })),
  board: [
    { code: "As", rank: 14, suit: "s" },
    { code: "Th", rank: 10, suit: "h" },
    { code: "2c", rank: 2, suit: "c" },
    { code: "7d", rank: 7, suit: "d" },
  ],
  holeCards: [
    { code: "Kd", rank: 13, suit: "d" },
    { code: "Qs", rank: 12, suit: "s" },
  ],
  legalActions: [
    { type: "fold" },
    { type: "call", amount: 40 },
    { type: "raise", minAmount: 120, maxAmount: 880 },
  ],
  history: ["Player 8 is all in", "You to act"],
  turnSecondsRemaining: 18,
};

export function NineSeatHarness() {
  return (
    <main className="!w-full max-w-none px-2 sm:px-4">
      <PokerTable onAction={() => undefined} table={nineSeatFixture} />
    </main>
  );
}
