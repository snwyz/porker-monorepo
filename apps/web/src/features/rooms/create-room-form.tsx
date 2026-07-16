"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoom } from "@/lib/api";

export function CreateRoomForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setPending(true);
        setError("");
        try {
          const room = await createRoom({
            name: String(data.get("name")),
            seats: Number(data.get("seats")),
            smallBlind: Number(data.get("smallBlind")),
            bigBlind: Number(data.get("bigBlind")),
            minBuyIn: Number(data.get("minBuyIn")),
            maxBuyIn: Number(data.get("maxBuyIn")),
            actionTimeoutSeconds: 30,
          });
          router.push(`/table/${room.id}`);
        } catch (reason) {
          setError(
            reason instanceof Error ? reason.message : "Could not create room",
          );
          setPending(false);
        }
      }}
    >
      <label>
        Room name
        <input name="name" defaultValue="Heads Up" required />
      </label>
      <label>
        Seats
        <input
          name="seats"
          type="number"
          min="2"
          max="9"
          defaultValue="2"
          required
        />
      </label>
      <label>
        Small blind
        <input
          name="smallBlind"
          type="number"
          min="1"
          defaultValue="5"
          required
        />
      </label>
      <label>
        Big blind
        <input
          name="bigBlind"
          type="number"
          min="2"
          defaultValue="10"
          required
        />
      </label>
      <label>
        Minimum buy-in
        <input
          name="minBuyIn"
          type="number"
          min="1"
          defaultValue="100"
          required
        />
      </label>
      <label>
        Maximum buy-in
        <input
          name="maxBuyIn"
          type="number"
          min="1"
          defaultValue="1000"
          required
        />
      </label>
      <button disabled={pending} type="submit">
        Create table
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
