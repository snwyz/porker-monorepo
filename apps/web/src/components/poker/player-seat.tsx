"use client";

import { CircleDot, Crown, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "../../lib/cn";

export interface PlayerSeatViewModel {
  readonly id: string;
  readonly displayName: string;
  readonly seat: number;
  readonly stack: number;
  readonly streetCommitted: number;
  readonly handCommitted: number;
  readonly status: "active" | "folded" | "all-in";
}

const stateLabel = {
  active: "Active",
  folded: "Folded",
  "all-in": "All in",
} as const;

export function PlayerSeat({
  isButton = false,
  isViewer = false,
  player,
  position,
  yourTurn = false,
}: {
  readonly isButton?: boolean;
  readonly isViewer?: boolean;
  readonly player: PlayerSeatViewModel;
  readonly position: { readonly x: number; readonly y: number };
  readonly yourTurn?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const accessibleName = `${player.displayName}, ${player.status}${yourTurn ? ", your turn" : ""}`;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      aria-label={accessibleName}
      className={cn(
        "absolute z-10 grid min-w-20 -translate-x-1/2 -translate-y-1/2 gap-0.5 rounded-xl border bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-2 py-1.5 text-center shadow-lg backdrop-blur-sm transition-[transform,opacity] motion-reduce:transition-none sm:min-w-28 sm:px-3 sm:py-2",
        yourTurn
          ? "border-[var(--primary)] ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--felt)]"
          : "border-[var(--border)]",
        player.status === "folded" && "opacity-65",
      )}
      data-seat-state={player.status}
      data-seat-x={`${position.x}%`}
      data-seat-y={`${position.y}%`}
      data-testid={`player-seat-${player.seat}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
      role="group"
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
    >
      <span className="flex min-w-0 items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] sm:text-xs">
        {yourTurn ? (
          <CircleDot aria-hidden="true" className="size-3" />
        ) : (
          <UserRound aria-hidden="true" className="size-3" />
        )}
        <span data-seat-state>
          {yourTurn ? "Your turn" : stateLabel[player.status]}
        </span>
      </span>
      <strong className="max-w-24 truncate text-xs sm:text-sm">
        {isViewer ? "You" : player.displayName}
      </strong>
      <span className="tabular-nums text-[11px] font-semibold text-[var(--primary)] sm:text-xs">
        {player.stack.toLocaleString("en-US")} chips
      </span>
      {isButton ? (
        <span
          aria-label="Dealer button"
          className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-[var(--text)] text-[var(--background)] shadow"
        >
          <Crown aria-hidden="true" className="size-3" />
        </span>
      ) : null}
    </motion.div>
  );
}
