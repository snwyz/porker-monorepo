"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  if (rooms.length === 0) return <p>No public rooms yet.</p>;

  return (
    <ul className="rooms">
      {rooms.map((room) => (
        <li data-testid={`room-${room.id}`} key={room.id}>
          <article>
            <strong>{room.name}</strong>
            <span>
              {room.seats} seats · {room.smallBlind}/{room.bigBlind} blinds
            </span>
            <span>
              Buy-in {room.minBuyIn}–{room.maxBuyIn}
            </span>
            <Link href={`/table/${room.id}`}>Join</Link>
          </article>
        </li>
      ))}
    </ul>
  );
}
