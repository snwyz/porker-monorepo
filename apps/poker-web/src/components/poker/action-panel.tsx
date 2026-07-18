"use client";

import { AlertTriangle, Check, Coins } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { cn } from "../../lib/cn";
import { useI18n } from "@poker/next-i18n/react";

export type LegalActionViewModel =
  | { readonly type: "fold" }
  | { readonly type: "check" }
  | { readonly type: "call"; readonly amount: number }
  | {
      readonly type: "bet";
      readonly minAmount: number;
      readonly maxAmount: number;
    }
  | {
      readonly type: "raise";
      readonly minAmount: number;
      readonly maxAmount: number;
    };

export type PokerActionIntent =
  | { readonly type: "fold" | "check" | "call" }
  | { readonly type: "bet" | "raise"; readonly amount: number };

const labelCode = {
  fold: "P000043",
  check: "P000044",
  call: "P000045",
  bet: "P000046",
  raise: "P000047",
} as const;

export function ActionPanel({
  disabled = false,
  error,
  legalActions,
  onAction,
  selectedAction,
}: {
  readonly disabled?: boolean;
  readonly error?: string;
  readonly legalActions: readonly LegalActionViewModel[];
  readonly onAction: (intent: PokerActionIntent) => void;
  readonly selectedAction?: PokerActionIntent["type"];
}) {
  const { t } = useI18n();
  const wager = useMemo(
    () =>
      legalActions.find(
        (action) => action.type === "bet" || action.type === "raise",
      ),
    [legalActions],
  );
  const [amount, setAmount] = useState(wager?.minAmount ?? 0);

  return (
    <section
      aria-label={t("P000048")}
      className="fixed bottom-0 left-0 z-30 grid w-full gap-2 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgba(0,0,0,0.35)] backdrop-blur-md lg:absolute lg:bottom-3 lg:left-1/2 lg:w-[min(42rem,calc(100%-1.5rem))] lg:-translate-x-1/2 lg:rounded-xl lg:border"
      data-testid="action-panel"
    >
      {error ? (
        <p
          className="flex items-center gap-2 text-sm text-[var(--destructive-hover)]"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            className="size-4"
            data-testid="action-error-icon"
          />
          {t("P000164")}
        </p>
      ) : null}
      {wager ? (
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <Slider
            aria-label={t("P000049")}
            max={wager.maxAmount}
            min={wager.minAmount}
            onValueChange={([next]) => setAmount(next ?? wager.minAmount)}
            step={1}
            value={[amount]}
          />
          <label className="grid grid-cols-[auto_5.5rem] items-center gap-2 text-xs text-[var(--muted)]">
            {t("P000050")}
            <input
              aria-label={t("P000050")}
              className="min-w-0 bg-[var(--background)] text-right tabular-nums text-[var(--text)]"
              max={wager.maxAmount}
              min={wager.minAmount}
              onChange={(event) => setAmount(Number(event.target.value))}
              type="number"
              value={amount}
            />
          </label>
          <span className="sr-only" data-testid="amount-range">
            {wager.minAmount}–{wager.maxAmount}
          </span>
        </div>
      ) : null}
      <div className="grid auto-cols-fr grid-flow-col gap-2">
        {legalActions.map((action) => {
          const selected = selectedAction === action.type;
          const wagerAmount =
            action.type === "bet" || action.type === "raise"
              ? amount
              : undefined;
          const callAmount = action.type === "call" ? action.amount : undefined;
          const actionLabel = `${t(labelCode[action.type])}${wagerAmount === undefined && callAmount === undefined ? "" : ` ${wagerAmount === undefined ? callAmount : `${t("P000086")} ${wagerAmount}`}`}`;
          const amountValid =
            action.type !== "bet" && action.type !== "raise"
              ? true
              : Number.isInteger(amount) &&
                amount >= action.minAmount &&
                amount <= action.maxAmount;

          return (
            <Button
              aria-label={actionLabel}
              aria-pressed={selected}
              className={cn(
                "min-w-0 px-2",
                action.type === "fold" && "text-[var(--destructive-hover)]",
              )}
              disabled={disabled || !amountValid}
              key={action.type}
              onClick={() =>
                onAction(
                  action.type === "bet" || action.type === "raise"
                    ? { type: action.type, amount }
                    : { type: action.type },
                )
              }
              variant={
                action.type === "fold"
                  ? "ghost"
                  : selected
                    ? "primary"
                    : "secondary"
              }
            >
              {selected ? (
                <Check aria-hidden="true" className="size-3" />
              ) : action.type === "call" ? (
                <Coins aria-hidden="true" className="size-3" />
              ) : null}
              <span>{t(labelCode[action.type])}</span>
              {selected ? <span className="sr-only">{t("P000051")}</span> : null}
              {callAmount !== undefined ? (
                <span className="tabular-nums">{callAmount}</span>
              ) : null}
            </Button>
          );
        })}
        {legalActions.length === 0 ? (
          <p className="col-span-full py-2 text-center text-sm text-[var(--muted)]">
            {t("P000052")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
