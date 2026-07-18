"use client";

import { motion, useReducedMotion } from "motion/react";

import { usePointsPreferences } from "../../modes/points-preferences-provider";
import { useI18n } from "@poker/next-i18n/react";

import { cn } from "../../lib/cn";

export interface CardViewModel {
  readonly code: string;
  readonly rank: number;
  readonly suit: string;
}

const rankCodes: Readonly<
  Record<number, "P000070" | "P000071" | "P000072" | "P000073">
> = {
  11: "P000070",
  12: "P000071",
  13: "P000072",
  14: "P000073",
};

const suitDetails: Readonly<
  Record<
    string,
    {
      readonly code: "P000074" | "P000075" | "P000076" | "P000077";
      readonly name: "clubs" | "diamonds" | "hearts" | "spades";
      readonly symbol: string;
      readonly red: boolean;
    }
  >
> = {
  c: { code: "P000074", name: "clubs", symbol: "♣", red: false },
  clubs: { code: "P000074", name: "clubs", symbol: "♣", red: false },
  d: { code: "P000075", name: "diamonds", symbol: "♦", red: true },
  diamonds: { code: "P000075", name: "diamonds", symbol: "♦", red: true },
  h: { code: "P000076", name: "hearts", symbol: "♥", red: true },
  hearts: { code: "P000076", name: "hearts", symbol: "♥", red: true },
  s: { code: "P000077", name: "spades", symbol: "♠", red: false },
  spades: { code: "P000077", name: "spades", symbol: "♠", red: false },
};

export function PlayingCard({
  card,
  className,
  hidden = false,
}: {
  readonly card?: CardViewModel;
  readonly className?: string;
  readonly hidden?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const { preferences } = usePointsPreferences();
  const { t } = useI18n();
  const suit = card ? suitDetails[card.suit.toLowerCase()] : undefined;
  const suitTone = suit
    ? preferences.fourColorSuits
      ? { clubs: "green", diamonds: "gold", hearts: "red", spades: "ink" }[
          suit.name
        ]
      : suit.red
        ? "red"
        : "ink"
    : undefined;
  const label =
    hidden || !card
      ? t("P000060")
      : t("P000069", {
          0: rankCodes[card.rank] ? t(rankCodes[card.rank]) : String(card.rank),
          1: suit ? t(suit.code) : card.suit,
        });

  return (
    <motion.div
      animate={{ opacity: 1, rotate: 0, y: 0 }}
      aria-label={label}
      className={cn(
        "relative grid aspect-[5/7] w-10 shrink-0 place-items-center overflow-hidden rounded-md border border-black/20 bg-[var(--card-face)] text-sm font-black shadow-[0_4px_10px_rgba(0,0,0,0.28)] transition-transform motion-reduce:animate-none motion-reduce:transition-none sm:w-12 lg:w-14",
        hidden || !card
          ? "bg-[repeating-linear-gradient(135deg,var(--walnut)_0_5px,var(--primary)_5px_7px)]"
          : suitTone === "red"
            ? "text-[var(--destructive)]"
            : suitTone === "green"
              ? "text-[var(--felt)]"
              : suitTone === "gold"
                ? "text-[var(--card-diamond)]"
                : "text-[var(--background)]",
        className,
      )}
      data-suit-tone={suitTone}
      initial={reduceMotion ? false : { opacity: 0, y: -12, rotate: -3 }}
      role="img"
      transition={{ duration: reduceMotion ? 0 : 0.22 }}
      whileHover={reduceMotion ? undefined : { y: -2 }}
    >
      {!hidden && card ? (
        <>
          <span className="absolute left-1 top-0.5 leading-none">
            {card.code[0]?.toUpperCase()}
          </span>
          <span aria-hidden="true" className="text-xl sm:text-2xl">
            {suit?.symbol ?? card.suit}
          </span>
          <span
            aria-hidden="true"
            className="absolute bottom-0.5 right-1 rotate-180 leading-none"
          >
            {card.code[0]?.toUpperCase()}
          </span>
        </>
      ) : (
        <span
          aria-hidden="true"
          className="size-3 rounded-full border border-[var(--primary)]"
        />
      )}
    </motion.div>
  );
}
