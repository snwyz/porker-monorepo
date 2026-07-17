"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { PageIntro, PointsPage } from "@/modes/points-entry";
import { usePointsPreferences } from "@/modes/points-preferences-provider";

export default function SettingsPage() {
  return (
    <PointsPage>
      <main className="max-w-3xl">
        <PageIntro eyebrow="Personalize play" title="Table preferences">
          Choose how cards and action feedback appear on this device. These
          choices do not change game rules.
        </PageIntro>
        <PreferencesForm />
      </main>
    </PointsPage>
  );
}

function PreferencesForm() {
  const { preferences, savePreferences } = usePointsPreferences();
  const [draft, setDraft] = useState(preferences);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = window.setTimeout(() => setDraft(preferences), 0);
    return () => window.clearTimeout(sync);
  }, [preferences]);

  return (
    <form
      className="gap-6 rounded-2xl p-6 sm:p-8"
      onSubmit={(event) => {
        event.preventDefault();
        savePreferences(draft);
        setSaved(true);
      }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface-raised)] text-[var(--primary)]">
          <SlidersHorizontal aria-hidden="true" />
        </span>
        <div>
          <h2 className="m-0 text-lg font-semibold">Display</h2>
          <p className="m-0 mt-1 text-sm text-[var(--muted)]">
            Comfort settings for this browser.
          </p>
        </div>
      </div>
      <fieldset className="grid gap-4 border-0 p-0">
        <legend className="sr-only">Display preferences</legend>
        <label className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-[var(--border)] p-4">
          <span>
            <strong className="block">Four-color suits</strong>
            <span className="text-sm text-[var(--muted)]">
              Use distinct suit colors alongside suit symbols.
            </span>
          </span>
          <input
            checked={draft.fourColorSuits}
            className="size-5 accent-[var(--primary)]"
            name="fourColorSuits"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                fourColorSuits: event.target.checked,
              }));
              setSaved(false);
            }}
            type="checkbox"
          />
        </label>
        <label className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-[var(--border)] p-4">
          <span>
            <strong className="block">Compact hand history</strong>
            <span className="text-sm text-[var(--muted)]">
              Start history in its space-saving view.
            </span>
          </span>
          <input
            checked={draft.compactHistory}
            className="size-5 accent-[var(--primary)]"
            name="compactHistory"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                compactHistory: event.target.checked,
              }));
              setSaved(false);
            }}
            type="checkbox"
          />
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Save preferences</Button>
        {saved ? (
          <p className="m-0 flex items-center gap-2 text-sm" role="status">
            <Check
              aria-hidden="true"
              className="size-4 text-[var(--primary)]"
            />{" "}
            Preferences saved
          </p>
        ) : null}
      </div>
    </form>
  );
}
