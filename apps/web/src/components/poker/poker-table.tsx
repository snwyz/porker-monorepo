"use client";

import { WifiOff } from "lucide-react";

import { useI18n } from "../../i18n/provider";

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
import styles from "./poker-table.module.css";
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
  Record<
    number,
    readonly {
      readonly x: number;
      readonly y: number;
      readonly shortX?: number;
      readonly shortY?: number;
    }[]
  >
> = {
  2: [
    { x: 28, y: 70, shortX: 18, shortY: 25 },
    { x: 72, y: 18, shortX: 82, shortY: 25 },
  ],
  3: [
    { x: 28, y: 70, shortX: 15, shortY: 25 },
    { x: 18, y: 22, shortX: 50, shortY: 25 },
    { x: 82, y: 22, shortX: 85, shortY: 25 },
  ],
  4: [
    { x: 28, y: 70, shortX: 12, shortY: 25 },
    { x: 12, y: 50, shortX: 37, shortY: 25 },
    { x: 50, y: 12, shortX: 63, shortY: 25 },
    { x: 88, y: 50, shortX: 88, shortY: 25 },
  ],
  5: [
    { x: 28, y: 70, shortX: 10, shortY: 25 },
    { x: 12, y: 58, shortX: 30, shortY: 25 },
    { x: 25, y: 15, shortX: 50, shortY: 25 },
    { x: 75, y: 15, shortX: 70, shortY: 25 },
    { x: 88, y: 58, shortX: 90, shortY: 25 },
  ],
  6: [
    { x: 28, y: 70, shortX: 9, shortY: 25 },
    { x: 14, y: 64, shortX: 25, shortY: 25 },
    { x: 14, y: 26, shortX: 42, shortY: 25 },
    { x: 50, y: 12, shortX: 58, shortY: 25 },
    { x: 86, y: 26, shortX: 75, shortY: 25 },
    { x: 86, y: 64, shortX: 91, shortY: 25 },
  ],
  7: [
    { x: 28, y: 70, shortX: 7, shortY: 25 },
    { x: 16, y: 66, shortX: 21, shortY: 25 },
    { x: 10, y: 42, shortX: 36, shortY: 25 },
    { x: 32, y: 12, shortX: 50, shortY: 25 },
    { x: 68, y: 12, shortX: 64, shortY: 25 },
    { x: 90, y: 42, shortX: 79, shortY: 25 },
    { x: 84, y: 66, shortX: 93, shortY: 25 },
  ],
  8: [
    { x: 28, y: 70, shortX: 6, shortY: 25 },
    { x: 20, y: 68, shortX: 19, shortY: 25 },
    { x: 9, y: 50, shortX: 31, shortY: 25 },
    { x: 20, y: 18, shortX: 44, shortY: 25 },
    { x: 50, y: 12, shortX: 56, shortY: 25 },
    { x: 80, y: 18, shortX: 69, shortY: 25 },
    { x: 91, y: 50, shortX: 81, shortY: 25 },
    { x: 80, y: 68, shortX: 94, shortY: 25 },
  ],
  9: [
    { x: 27, y: 75, shortX: 6, shortY: 25 },
    { x: 9, y: 66, shortX: 17, shortY: 25 },
    { x: 9, y: 48, shortX: 28, shortY: 25 },
    { x: 12, y: 29, shortX: 39, shortY: 25 },
    { x: 34, y: 11, shortX: 50, shortY: 25 },
    { x: 66, y: 11, shortX: 61, shortY: 25 },
    { x: 88, y: 29, shortX: 72, shortY: 25 },
    { x: 91, y: 48, shortX: 83, shortY: 25 },
    { x: 75, y: 75, shortX: 94, shortY: 25 },
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
  const { t } = useI18n();
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
        <header
          className={`absolute left-1/2 top-[34%] z-10 flex -translate-x-1/2 flex-col items-center gap-2 ${seatCount >= 7 ? styles.shortHeader : styles.comfortableShortHeader}`}
        >
          <div className="flex items-center gap-2">
            <span
              className="rounded-full bg-black/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]"
              data-testid="phase"
            >
              {table.phase}
            </span>
            <span className="sr-only" data-testid="current-bet">
              {t("P00057", { 0: table.currentBet })}
            </span>
            <span className="sr-only" data-testid="version">
              {table.version}
            </span>
            {!connected ? (
              <span className="flex items-center gap-1 rounded-full bg-[var(--destructive)] px-2 py-1 text-[10px] font-semibold">
                <WifiOff aria-hidden="true" className="size-3" /> {t("P00058")}
              </span>
            ) : null}
          </div>
          <CommunityCards cards={table.board} />
          <span className="sr-only" data-testid="hole-cards">
            {t("P00059")}:{" "}
            {table.holeCards.map((card) => card.code).join(" ") || "—"}
          </span>
          <div className={styles.sideInformation}>
            <div data-testid="pot">
              <PotDisplay amount={pot} />
            </div>
            {table.turnSecondsRemaining !== undefined &&
            table.phase !== "complete" ? (
              <TurnTimer seconds={table.turnSecondsRemaining} />
            ) : null}
          </div>
        </header>

        {table.players.map((player) => (
          <PlayerSeat
            dense={seatCount >= 7}
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
          aria-label={t("P00059")}
          className={`absolute bottom-[29%] left-1/2 z-20 flex -translate-x-1/2 gap-1 sm:gap-2 ${seatCount >= 7 ? `${styles.shortOwnCards} ${styles.denseOwnCards}` : `${styles.comfortableOwnCards} ${styles.comfortableShortOwnCards}`}`}
        >
          {table.holeCards.length
            ? table.holeCards.map((card) => (
                <PlayingCard card={card} key={card.code} />
              ))
            : [0, 1].map((index) => <PlayingCard hidden key={index} />)}
        </section>

        <div
          className={`absolute right-3 top-3 lg:hidden ${seatCount >= 7 ? styles.shortHistory : ""}`}
        >
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
