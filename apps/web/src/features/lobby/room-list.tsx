"use client";

import { ArrowRight, CircleDot, Layers3, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { listRooms, type Room } from "@/lib/api";

export function RoomList() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listRooms()
      .then(setRooms)
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : "Could not load rooms",
        );
      });
  }, []);

  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (rooms.length === 0)
    return (
      <section className="panel place-items-center py-12 text-center">
        <Layers3 aria-hidden="true" className="size-8 text-[var(--primary)]" />
        <h2 className="m-0 text-xl font-semibold">No public rooms yet</h2>
        <p className="m-0 max-w-md text-sm text-[var(--muted)]">
          Create the first table and invite another player to take a seat.
        </p>
      </section>
    );

  return (
    <ul className="rooms sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => (
        <li data-testid={`room-${room.id}`} key={room.id}>
          <article className="h-full gap-5 rounded-xl p-5 transition-transform motion-reduce:transition-none hover:-translate-y-0.5 motion-reduce:hover:translate-y-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="block text-lg">{room.name}</strong>
                <span
                  className="mt-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--primary)]"
                  aria-label="Join state: open to join"
                >
                  <CircleDot aria-hidden="true" className="size-3" /> Open to
                  join
                </span>
              </div>
              <span className="rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs">
                Cash
              </span>
            </div>
            <dl className="m-0 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-[var(--muted)]">
                  <Users aria-hidden="true" className="size-4" /> Seats
                </dt>
                <dd className="m-0 font-semibold">Up to {room.seats}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--muted)]">Blinds</dt>
                <dd className="m-0 font-semibold tabular-nums">
                  {room.smallBlind}/{room.bigBlind}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--muted)]">Buy-in</dt>
                <dd className="m-0 font-semibold tabular-nums">
                  {room.minBuyIn}–{room.maxBuyIn}
                </dd>
              </div>
            </dl>
            <Link
              className={`${buttonVariants({ variant: "secondary" })} mt-auto w-full no-underline`}
              href={`/table/${room.id}`}
            >
              Join <ArrowRight aria-hidden="true" />
            </Link>
          </article>
        </li>
      ))}
    </ul>
  );
}
