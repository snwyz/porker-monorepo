"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { RoomList } from "@/features/lobby/room-list";
import { refreshGuest, type Guest } from "@/lib/api";
import { useI18n } from "@/i18n/provider";
import { PointsPage, PageIntro } from "@/modes/points-entry";

export default function LobbyPage() {
  const { t } = useI18n();
  const [guest, setGuest] = useState<Guest | null>(null);
  useEffect(() => {
    const refresh = () => void refreshGuest().then(setGuest);
    const initial = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(initial);
  }, []);

  return (
    <PointsPage>
      <main>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <PageIntro eyebrow={t("P000101")} title={t("P000102")}>
            {t("P000103")}
          </PageIntro>
          <Link
            className={`${buttonVariants({ variant: "primary" })} mb-8 no-underline`}
            href="/rooms/new"
          >
            <Plus aria-hidden="true" /> {t("P000104")}
          </Link>
        </div>
        <section
          aria-label={t("P000105")}
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4"
        >
          <div>
            <span className="block text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              {t("P000106")}
            </span>
            <strong>{guest?.nickname ?? t("P000107")}</strong>
          </div>
          <p className="m-0 text-right">
            <span className="block text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              {t("P000108")}
            </span>
            <strong className="text-lg tabular-nums text-[var(--primary)]">
              <span data-testid="points-balance">{guest?.points ?? "…"}</span>{" "}
              {t("P000109")}
            </strong>
          </p>
        </section>
        <RoomList />
      </main>
    </PointsPage>
  );
}
