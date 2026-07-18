"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { createGuest } from "@/lib/api";
import { useI18n } from "@poker/next-i18n/react";

export function GuestEntry() {
  const { t } = useI18n();
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
        } catch {
          setError(t("P000142"));
          setPending(false);
        }
      }}
    >
      <label className="text-sm font-medium" htmlFor="nickname">
        {t("P000138")}
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
          placeholder={t("P000161")}
        />
      </label>
      <p
        className="m-0 text-xs leading-5 text-[var(--muted)]"
        id="nickname-help"
      >
        {t("P000139")}
      </p>
      <Button
        className="mt-2 w-full"
        disabled={!mounted}
        loading={pending}
        loadingText={t("P000140")}
        size="lg"
        type="submit"
      >
        {t("P000141")}
      </Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
