"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RoomList } from "@/features/lobby/room-list";
import { getStoredGuest, type Guest } from "@/lib/api";

export default function LobbyPage() {
  const [guest, setGuest] = useState<Guest | null>(null);
  useEffect(() => {
    const refresh = () => setGuest(getStoredGuest());
    refresh();
    window.addEventListener("poker:guest", refresh);
    return () => window.removeEventListener("poker:guest", refresh);
  }, []);

  return (
    <main>
      <div className="row">
        <h1>Public tables</h1>
        <Link href="/rooms/new">Create room</Link>
      </div>
      <p>
        {guest?.nickname ?? "Guest"} ·{" "}
        <span data-testid="points-balance">{guest?.points ?? "…"}</span> points
      </p>
      <RoomList />
    </main>
  );
}
