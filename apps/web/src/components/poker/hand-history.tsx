"use client";

import { ScrollText } from "lucide-react";

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

function HistoryList({ entries }: { readonly entries: readonly string[] }) {
  return entries.length ? (
    <ol className="grid gap-2 text-sm">
      {entries.map((entry, index) => (
        <li
          className="border-b border-white/10 pb-2 text-[var(--muted)]"
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
    <p className="text-sm text-[var(--muted)]">No actions recorded yet.</p>
  );
}

export function HandHistory({
  className,
  entries,
}: {
  readonly className?: string;
  readonly entries: readonly string[];
}) {
  return (
    <aside
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4",
        className,
      )}
      data-testid="desktop-hand-history"
    >
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <ScrollText
          aria-hidden="true"
          className="size-4 text-[var(--primary)]"
        />
        Hand history
      </h2>
      <HistoryList entries={entries} />
    </aside>
  );
}

export function CompactHandHistory({
  entries,
}: {
  readonly entries: readonly string[];
}) {
  return (
    <div className="lg:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            aria-label="Hand history"
            size="icon"
            variant="secondary"
            icon={<ScrollText aria-hidden="true" />}
          >
            <span className="sr-only">Hand history</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="max-h-[85dvh] overflow-y-auto" side="bottom">
          <SheetHeader>
            <SheetTitle>Hand history</SheetTitle>
            <SheetDescription>
              Actions committed during this hand.
            </SheetDescription>
          </SheetHeader>
          <HistoryList entries={entries} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
