"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { createGuest } from "@/lib/api";

export function GuestEntry() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        try {
          await createGuest(nickname);
          router.push("/lobby");
        } catch (reason) {
          setError(
            reason instanceof Error ? reason.message : "Could not enter",
          );
          setPending(false);
        }
      }}
    >
      <label>
        Nickname
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          minLength={3}
          maxLength={24}
          pattern="[A-Za-z0-9_]+"
          required
        />
      </label>
      <button disabled={!mounted || pending} type="submit">
        Play as guest
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
