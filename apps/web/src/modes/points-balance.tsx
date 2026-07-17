"use client";

import { CircleDollarSign, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { refreshGuest, type Guest } from "@/lib/api";
import { PageIntro } from "./points-entry";

export function PointsBalanceContent() {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  async function loadBalance() {
    setPending(true);
    setError("");
    try {
      setGuest(await refreshGuest());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not refresh points",
      );
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void loadBalance(), 0);
    return () => window.clearTimeout(initial);
  }, []);

  return (
    <main className="max-w-3xl">
      <PageIntro eyebrow="Account overview" title="Points balance">
        Your available points come from the game server and update after joining
        or leaving a table.
      </PageIntro>
      <section className="grid gap-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl shadow-black/15 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Available to play
            </span>
            <p
              className="m-0 mt-2 text-4xl font-semibold tabular-nums text-[var(--primary)]"
              data-testid="points-balance"
            >
              {guest?.points ?? (pending ? "…" : "—")} {" "}
              <span className="text-base text-[var(--muted)]">points</span>
            </p>
          </div>
          <span className="grid size-12 place-items-center rounded-full bg-[var(--surface-raised)] text-[var(--primary)]">
            <CircleDollarSign aria-hidden="true" />
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
          <p className="m-0 text-sm text-[var(--muted)]">
            Player: {" "}
            <strong className="text-[var(--text)]">
              {guest?.nickname ?? "No active guest"}
            </strong>
          </p>
          <Button
            icon={<RefreshCw aria-hidden="true" />}
            loading={pending}
            loadingText="Refreshing"
            onClick={() => void loadBalance()}
            variant="secondary"
          >
            Refresh points
          </Button>
        </div>
        {error ? (
          <p className="error m-0" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
