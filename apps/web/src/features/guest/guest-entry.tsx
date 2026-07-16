"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
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
      className="border-0 bg-transparent p-0"
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
      <label className="text-sm font-medium" htmlFor="nickname">
        Nickname
        <input
          aria-describedby="nickname-help"
          autoComplete="nickname"
          className="min-h-11 border-[var(--border)] bg-[var(--background)] text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          id="nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          minLength={3}
          maxLength={24}
          pattern="[A-Za-z0-9_]+"
          required
          placeholder="RiverFox"
        />
      </label>
      <p
        className="m-0 text-xs leading-5 text-[var(--muted)]"
        id="nickname-help"
      >
        3–24 letters, numbers, or underscores.
      </p>
      <Button
        className="mt-2 w-full"
        disabled={!mounted}
        loading={pending}
        loadingText="Entering lobby"
        size="lg"
        type="submit"
      >
        Play as guest
      </Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
