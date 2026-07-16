"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { RoomList } from "@/features/lobby/room-list";
import { refreshGuest, type Guest } from "@/lib/api";
import { PointsPage, PageIntro } from "@/modes/points-entry";

export default function LobbyPage() {
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
          <PageIntro eyebrow="Live room list" title="Public tables">
            Find an open seat or set the stakes for a new table. Every room uses
            free points and authoritative table state.
          </PageIntro>
          <Link
            className={`${buttonVariants({ variant: "primary" })} mb-8 no-underline`}
            href="/rooms/new"
          >
            <Plus aria-hidden="true" /> Create room
          </Link>
        </div>
        <section
          aria-label="Current player"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4"
        >
          <div>
            <span className="block text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Playing as
            </span>
            <strong>{guest?.nickname ?? "Guest"}</strong>
          </div>
          <p className="m-0 text-right">
            <span className="block text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Available
            </span>
            <strong className="text-lg tabular-nums text-[var(--primary)]">
              <span data-testid="points-balance">{guest?.points ?? "…"}</span>{" "}
              points
            </strong>
          </p>
        </section>
        <RoomList />
      </main>
    </PointsPage>
  );
}
