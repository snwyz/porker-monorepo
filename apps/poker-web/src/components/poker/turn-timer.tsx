import { Clock3 } from "lucide-react";

import { cn } from "../../lib/cn";
import { useI18n } from "@poker/next-i18n/react";

export function TurnTimer({
  seconds,
  totalSeconds = 30,
}: {
  readonly seconds: number;
  readonly totalSeconds?: number;
}) {
  const { t } = useI18n();
  const urgent = seconds <= 8;
  const progress = Math.max(
    0,
    Math.min(100, (seconds / Math.max(1, totalSeconds)) * 100),
  );

  return (
    <div
      aria-label={t("P000042", { 0: seconds })}
      aria-live={urgent ? "polite" : "off"}
      className={cn(
        "flex min-w-24 items-center gap-2 rounded-full border bg-black/25 px-3 py-1 text-xs transition-colors motion-reduce:transition-none",
        urgent ? "border-[var(--destructive)]" : "border-white/25",
      )}
      role="timer"
    >
      <Clock3 aria-hidden="true" className="size-3.5" />
      <span className="tabular-nums">{t("P000087", { 0: seconds })}</span>
      <span
        className="h-1 w-8 overflow-hidden rounded-full bg-white/15"
        role="presentation"
      >
        <span
          className={cn(
            "block h-full",
            urgent ? "bg-[var(--destructive)]" : "bg-[var(--primary)]",
          )}
          style={{ width: `${progress}%` }}
        />
      </span>
      {urgent ? <span className="sr-only">{t("P000053")}</span> : null}
    </div>
  );
}
