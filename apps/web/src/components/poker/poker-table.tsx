"use client";

import { WifiOff } from "lucide-react";

import {
  ActionPanel,
  type LegalActionViewModel,
  type PokerActionIntent,
} from "./action-panel";
import { CommunityCards } from "./community-cards";
import { CompactHandHistory, HandHistory } from "./hand-history";
import { PlayingCard, type CardViewModel } from "./playing-card";
import { PlayerSeat, type PlayerSeatViewModel } from "./player-seat";
import { PotDisplay } from "./pot-display";
import { TurnTimer } from "./turn-timer";

export interface TableViewModel {
  readonly tableId: string;
  readonly handId: string;
  readonly phase: "preflop" | "flop" | "turn" | "river" | "complete";
  readonly version: number;
  readonly viewerId?: string;
  readonly actorId: string;
  readonly currentBet: number;
  readonly minimumRaise: number;
  readonly seatCount: number;
  readonly buttonSeat?: number;
  readonly players: readonly PlayerSeatViewModel[];
  readonly board: readonly CardViewModel[];
  readonly holeCards: readonly CardViewModel[];
  readonly legalActions: readonly LegalActionViewModel[];
  readonly history: readonly string[];
  readonly turnSecondsRemaining?: number;
}

export type { PokerActionIntent } from "./action-panel";

const seatMaps: Readonly<
  Record<number, readonly { readonly x: number; readonly y: number }[]>
> = {
  2: [
    { x: 28, y: 70 },
    { x: 72, y: 18 },
  ],
  3: [
    { x: 28, y: 70 },
    { x: 18, y: 22 },
    { x: 82, y: 22 },
  ],
  4: [
    { x: 28, y: 70 },
    { x: 12, y: 50 },
    { x: 50, y: 12 },
    { x: 88, y: 50 },
  ],
  5: [
    { x: 28, y: 70 },
    { x: 12, y: 58 },
    { x: 25, y: 15 },
    { x: 75, y: 15 },
    { x: 88, y: 58 },
  ],
  6: [
    { x: 28, y: 70 },
    { x: 14, y: 64 },
    { x: 14, y: 26 },
    { x: 50, y: 12 },
    { x: 86, y: 26 },
    { x: 86, y: 64 },
  ],
  7: [
    { x: 28, y: 70 },
    { x: 16, y: 66 },
    { x: 10, y: 42 },
    { x: 32, y: 12 },
    { x: 68, y: 12 },
    { x: 90, y: 42 },
    { x: 84, y: 66 },
  ],
  8: [
    { x: 28, y: 70 },
    { x: 20, y: 68 },
    { x: 9, y: 50 },
    { x: 20, y: 18 },
    { x: 50, y: 12 },
    { x: 80, y: 18 },
    { x: 91, y: 50 },
    { x: 80, y: 68 },
  ],
  9: [
    { x: 28, y: 70 },
    { x: 22, y: 68 },
    { x: 8, y: 58 },
    { x: 10, y: 30 },
    { x: 33, y: 12 },
    { x: 67, y: 12 },
    { x: 90, y: 30 },
    { x: 92, y: 58 },
    { x: 78, y: 68 },
  ],
};

export function PokerTable({
  actionDisabled = false,
  connected = true,
  error,
  onAction,
  selectedAction,
  table,
}: {
  readonly actionDisabled?: boolean;
  readonly connected?: boolean;
  readonly error?: string;
  readonly onAction: (intent: PokerActionIntent) => void;
  readonly selectedAction?: PokerActionIntent["type"];
  readonly table: TableViewModel;
}) {
  const seatCount = Math.max(2, Math.min(9, table.seatCount));
  const positions = seatMaps[seatCount] ?? seatMaps[9]!;
  const pot = table.players.reduce(
    (sum, player) => sum + player.handCommitted,
    0,
  );
  const viewerSeat =
    table.players.find((player) => player.id === table.viewerId)?.seat ?? 0;

  return (
    <section
      className="relative mx-auto grid min-h-[clamp(11rem,calc(100dvh-13.5rem),44rem)] w-full max-w-[90rem] grid-cols-1 gap-4 overflow-hidden pb-44 md:pb-36 lg:grid-cols-[minmax(0,1fr)_18rem] lg:overflow-visible lg:pb-0"
      data-testid="poker-table"
    >
      <div
        className="relative min-h-[clamp(11rem,calc(100dvh-13.5rem),38rem)] overflow-hidden rounded-[clamp(2rem,8vw,7rem)] border-[clamp(0.75rem,2vw,1.5rem)] border-[var(--walnut)] bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--felt)_90%,white)_0%,var(--felt)_65%,color-mix(in_srgb,var(--felt)_75%,black)_100%)] shadow-[inset_0_0_0_2px_rgba(214,178,98,0.5),inset_0_0_45px_rgba(0,0,0,0.45),0_18px_50px_rgba(0,0,0,0.38)]"
        data-testid="table-surface"
      >
        <header className="absolute left-1/2 top-[34%] z-10 flex -translate-x-1/2 flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full bg-black/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]"
              data-testid="phase"
            >
              {table.phase}
            </span>
            <span className="sr-only" data-testid="current-bet">
              Current bet: {table.currentBet}
            </span>
            <span className="sr-only" data-testid="version">
              {table.version}
            </span>
            {!connected ? (
              <span className="flex items-center gap-1 rounded-full bg-[var(--destructive)] px-2 py-1 text-[10px] font-semibold">
                <WifiOff aria-hidden="true" className="size-3" /> Reconnecting
              </span>
            ) : null}
          </div>
          <CommunityCards cards={table.board} />
          <span className="sr-only" data-testid="hole-cards">
            Your cards:{" "}
            {table.holeCards.map((card) => card.code).join(" ") || "—"}
          </span>
          <div data-testid="pot">
            <PotDisplay amount={pot} />
          </div>
          {table.turnSecondsRemaining !== undefined &&
          table.phase !== "complete" ? (
            <TurnTimer seconds={table.turnSecondsRemaining} />
          ) : null}
        </header>

        {table.players.map((player) => (
          <PlayerSeat
            isButton={player.seat === table.buttonSeat}
            isViewer={player.id === table.viewerId}
            key={player.id}
            player={player}
            position={
              positions[(player.seat - viewerSeat + seatCount) % seatCount] ??
              positions[player.seat % positions.length]!
            }
            yourTurn={player.id === table.actorId && table.phase !== "complete"}
          />
        ))}

        <section
          aria-label="Your cards"
          className="absolute bottom-[30%] left-1/2 z-20 flex -translate-x-1/2 gap-1 sm:gap-2"
        >
          {table.holeCards.length
            ? table.holeCards.map((card) => (
                <PlayingCard card={card} key={card.code} />
              ))
            : [0, 1].map((index) => <PlayingCard hidden key={index} />)}
        </section>

        <div className="absolute right-3 top-3 lg:hidden">
          <CompactHandHistory entries={table.history} />
        </div>

        <ActionPanel
          disabled={actionDisabled}
          error={error}
          key={table.legalActions
            .map((action) =>
              action.type === "bet" || action.type === "raise"
                ? `${action.type}:${action.minAmount}:${action.maxAmount}`
                : action.type,
            )
            .join("|")}
          legalActions={table.legalActions}
          onAction={onAction}
          selectedAction={selectedAction}
        />
      </div>

      <HandHistory className="hidden lg:block" entries={table.history} />
    </section>
  );
}
