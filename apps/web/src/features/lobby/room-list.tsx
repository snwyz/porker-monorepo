"use client";

import { ArrowRight, CircleDot, Layers3, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { listRooms, type Room } from "@/lib/api";
import { useI18n } from "@/i18n/provider";

export function RoomList() {
  const { t } = useI18n();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    listRooms()
      .then(setRooms)
      .catch(() => {
        setHasError(true);
      });
  }, []);

  if (hasError)
    return (
      <p className="error" role="alert">
        {t("P00160")}
      </p>
    );
  if (rooms.length === 0)
    return (
      <section className="panel place-items-center py-12 text-center">
        <Layers3 aria-hidden="true" className="size-8 text-[var(--primary)]" />
        <h2 className="m-0 text-xl font-semibold">{t("P00143")}</h2>
        <p className="m-0 max-w-md text-sm text-[var(--muted)]">
          {t("P00144")}
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
                <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
                  <CircleDot aria-hidden="true" className="size-3" />{" "}
                  {t("P00146")}
                </span>
              </div>
              <span className="rounded-full bg-[var(--surface-raised)] px-2.5 py-1 text-xs">
                {t("P00147")}
              </span>
            </div>
            <dl className="m-0 grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-[var(--muted)]">
                  <Users aria-hidden="true" className="size-4" /> {t("P00128")}
                </dt>
                <dd className="m-0 font-semibold">
                  {t("P00148", { 0: room.seats })}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--muted)]">{t("P00149")}</dt>
                <dd className="m-0 font-semibold tabular-nums">
                  {room.smallBlind}/{room.bigBlind}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--muted)]">{t("P00150")}</dt>
                <dd className="m-0 font-semibold tabular-nums">
                  {room.minBuyIn}–{room.maxBuyIn}
                </dd>
              </div>
            </dl>
            <Link
              className={`${buttonVariants({ variant: "secondary" })} mt-auto w-full no-underline`}
              href={`/table/${room.id}`}
            >
              {t("P00151")} <ArrowRight aria-hidden="true" />
            </Link>
          </article>
        </li>
      ))}
    </ul>
  );
}
