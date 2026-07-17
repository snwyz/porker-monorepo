"use client";

import { CircleDollarSign, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { refreshGuest, type Guest } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { PageIntro } from "./points-entry";

export function PointsBalanceContent() {
  const { t } = useI18n();
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
      <PageIntro eyebrow={t("P00152")} title={t("P00153")}>
        {t("P00154")}
      </PageIntro>
      <section className="grid gap-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl shadow-black/15 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              {t("P00155")}
            </span>
            <p
              className="m-0 mt-2 text-4xl font-semibold tabular-nums text-[var(--primary)]"
              data-testid="points-balance"
            >
              {guest?.points ?? (pending ? "…" : "—")}{" "}
              <span className="text-base text-[var(--muted)]">
                {t("P00109")}
              </span>
            </p>
          </div>
          <span className="grid size-12 place-items-center rounded-full bg-[var(--surface-raised)] text-[var(--primary)]">
            <CircleDollarSign aria-hidden="true" />
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
          <p className="m-0 text-sm text-[var(--muted)]">
            {t("P00156")}:{" "}
            <strong className="text-[var(--text)]">
              {guest?.nickname ?? t("P00157")}
            </strong>
          </p>
          <Button
            icon={<RefreshCw aria-hidden="true" />}
            loading={pending}
            loadingText={t("P00158")}
            onClick={() => void loadBalance()}
            variant="secondary"
          >
            {t("P00159")}
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
