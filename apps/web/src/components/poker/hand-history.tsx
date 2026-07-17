"use client";

import { ScrollText } from "lucide-react";

import { usePointsPreferences } from "../../modes/points-preferences-provider";
import { useI18n } from "../../i18n/provider";

import { Button } from "../ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { cn } from "../../lib/cn";

function HistoryList({
  compact,
  entries,
}: {
  readonly compact: boolean;
  readonly entries: readonly string[];
}) {
  const { t } = useI18n();
  return entries.length ? (
    <ol className={cn("grid text-sm", compact ? "gap-1" : "gap-3")}>
      {entries.map((entry, index) => (
        <li
          className={cn(
            "border-b border-white/10 text-[var(--muted)]",
            compact ? "pb-1" : "pb-3",
          )}
          key={`${index}-${entry}`}
        >
          <span className="mr-2 tabular-nums text-[var(--primary)]">
            {index + 1}.
          </span>
          {entry}
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-sm text-[var(--muted)]">{t("P00079")}</p>
  );
}

export function HandHistory({
  className,
  entries,
}: {
  readonly className?: string;
  readonly entries: readonly string[];
}) {
  const { preferences } = usePointsPreferences();
  const { t } = useI18n();
  return (
    <aside
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--surface)]",
        preferences.compactHistory ? "p-3" : "p-5",
        className,
      )}
      data-history-density={
        preferences.compactHistory ? "compact" : "comfortable"
      }
      data-testid="desktop-hand-history"
    >
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <ScrollText
          aria-hidden="true"
          className="size-4 text-[var(--primary)]"
        />
        {t("P00078")}
      </h2>
      <HistoryList compact={preferences.compactHistory} entries={entries} />
    </aside>
  );
}

export function CompactHandHistory({
  entries,
}: {
  readonly entries: readonly string[];
}) {
  const { preferences } = usePointsPreferences();
  const { t } = useI18n();
  return (
    <div className="lg:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            aria-label={t("P00078")}
            size="icon"
            variant="secondary"
            icon={<ScrollText aria-hidden="true" />}
          >
            <span className="sr-only">{t("P00078")}</span>
          </Button>
        </SheetTrigger>
        <SheetContent
          className="max-h-[85dvh] overflow-y-auto"
          data-history-density={
            preferences.compactHistory ? "compact" : "comfortable"
          }
          side="bottom"
        >
          <SheetHeader>
            <SheetTitle>{t("P00078")}</SheetTitle>
            <SheetDescription>{t("P00080")}</SheetDescription>
          </SheetHeader>
          <HistoryList compact={preferences.compactHistory} entries={entries} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
