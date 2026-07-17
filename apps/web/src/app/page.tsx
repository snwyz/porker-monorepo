"use client";

import { ArrowRight, ShieldCheck, Sparkles, Users } from "lucide-react";

import { GuestEntry } from "@/features/guest/guest-entry";
import { useI18n } from "@/i18n/provider";
import { PointsPage } from "@/modes/points-entry";

export default function Home() {
  const { t } = useI18n();
  return (
    <PointsPage>
      <main className="grid min-h-[calc(100dvh-65px)] items-center gap-10 py-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] lg:py-20">
        <section className="grid gap-7">
          <div className="grid gap-4">
            <p className="m-0 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--primary)]">
              <Sparkles aria-hidden="true" className="size-4" /> {t("P00093")}
            </p>
            <h1 className="m-0 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              {t("P00168")}
            </h1>
            <p className="m-0 max-w-xl text-lg leading-8 text-[var(--muted)]">
              {t("P00094")}
            </p>
          </div>
          <ul className="m-0 grid max-w-2xl list-none gap-3 p-0 sm:grid-cols-2">
            <li className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <Users
                aria-hidden="true"
                className="size-5 text-[var(--primary)]"
              />
              <span>
                <strong className="block">{t("P00095")}</strong>
                <span className="text-sm text-[var(--muted)]">
                  {t("P00096")}
                </span>
              </span>
            </li>
            <li className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <ShieldCheck
                aria-hidden="true"
                className="size-5 text-[var(--primary)]"
              />
              <span>
                <strong className="block">{t("P00097")}</strong>
                <span className="text-sm text-[var(--muted)]">
                  {t("P00098")}
                </span>
              </span>
            </li>
          </ul>
        </section>
        <section className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,var(--surface),color-mix(in_srgb,var(--felt)_22%,var(--surface)))] p-1 shadow-2xl shadow-black/30">
          <div className="rounded-[0.8rem] border border-white/5 bg-[var(--surface)] p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="m-0 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  {t("P00099")}
                </p>
                <h2 className="m-0 mt-1 text-2xl font-semibold">
                  {t("P00100")}
                </h2>
              </div>
              <ArrowRight
                aria-hidden="true"
                className="size-6 text-[var(--primary)]"
              />
            </div>
            <GuestEntry />
          </div>
        </section>
      </main>
    </PointsPage>
  );
}
