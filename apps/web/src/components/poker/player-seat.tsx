"use client";

import { CircleDot, Crown, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";

import { cn } from "../../lib/cn";
import { useI18n } from "../../i18n/provider";
import styles from "./player-seat.module.css";

export interface PlayerSeatViewModel {
  readonly id: string;
  readonly displayName: string;
  readonly seat: number;
  readonly stack: number;
  readonly streetCommitted: number;
  readonly handCommitted: number;
  readonly status: "active" | "folded" | "all-in";
}

const stateCode = {
  active: "P000061",
  folded: "P000062",
  "all-in": "P000063",
} as const;
const accessibleStateCode = {
  active: "P000088",
  folded: "P000089",
  "all-in": "P000090",
} as const;

export function PlayerSeat({
  dense = false,
  isButton = false,
  isViewer = false,
  player,
  position,
  yourTurn = false,
}: {
  readonly dense?: boolean;
  readonly isButton?: boolean;
  readonly isViewer?: boolean;
  readonly player: PlayerSeatViewModel;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly shortX?: number;
    readonly shortY?: number;
  };
  readonly yourTurn?: boolean;
}) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const playerNameId = `player-seat-name-${player.id}`;
  const playerStateId = `player-seat-state-${player.id}`;
  const accessibleState = `${t(accessibleStateCode[player.status])}${
    yourTurn ? t("P000091") : ""
  }`;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      aria-describedby={playerStateId}
      aria-labelledby={playerNameId}
      className={cn(
        "absolute z-10 grid min-w-20 -translate-x-1/2 -translate-y-1/2 gap-0.5 rounded-xl border bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-2 py-1.5 text-center shadow-lg backdrop-blur-sm transition-[transform,opacity] motion-reduce:transition-none sm:min-w-28 sm:px-3 sm:py-2",
        styles.shortPosition,
        dense &&
          "w-14 min-w-14 max-w-14 px-1 py-1 sm:w-16 sm:min-w-16 sm:max-w-16 sm:px-1 sm:py-1 lg:w-auto lg:min-w-28 lg:max-w-none lg:px-3 lg:py-2",
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
      style={
        {
          left: `${position.x}%`,
          top: `${position.y}%`,
          "--seat-short-x": `${position.shortX ?? position.x}%`,
          "--seat-short-y": `${position.shortY ?? position.y}%`,
        } as CSSProperties
      }
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
    >
      <span
        className={cn(
          "flex min-w-0 items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] sm:text-xs",
          dense && "sm:text-[10px] lg:text-xs",
        )}
      >
        {yourTurn ? (
          <CircleDot aria-hidden="true" className="size-3" />
        ) : (
          <UserRound aria-hidden="true" className="size-3" />
        )}
        <span data-seat-state>
          {yourTurn && dense ? (
            <>
              <span aria-hidden="true">{t("P000064")}</span>
              <span className="sr-only">{t("P000065")}</span>
            </>
          ) : yourTurn ? (
            t("P000065")
          ) : (
            t(stateCode[player.status])
          )}
        </span>
      </span>
      <span className="sr-only" id={playerStateId}>
        {accessibleState}
      </span>
      <strong
        className={cn(
          "max-w-24 truncate text-xs sm:text-sm",
          dense && "sm:text-xs lg:text-sm",
        )}
        id={playerNameId}
      >
        {isViewer ? t("P000066") : player.displayName}
      </strong>
      <span
        className={cn(
          "tabular-nums text-[11px] font-semibold text-[var(--primary)] sm:text-xs",
          dense && "sm:text-[11px] lg:text-xs",
        )}
      >
        {player.stack.toLocaleString("en-US")}
        {dense ? null : ` ${t("P000067")}`}
      </span>
      {isButton ? (
        <span
          aria-label={t("P000068")}
          className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-[var(--text)] text-[var(--background)] shadow"
        >
          <Crown aria-hidden="true" className="size-3" />
        </span>
      ) : null}
    </motion.div>
  );
}
