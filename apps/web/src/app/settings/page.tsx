"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { PageIntro, PointsPage } from "@/modes/points-entry";
import { usePointsPreferences } from "@/modes/points-preferences-provider";
import { useI18n } from "@/i18n/provider";

export default function SettingsPage() {
  const { t } = useI18n();
  return (
    <PointsPage>
      <main className="max-w-3xl">
        <PageIntro eyebrow={t("P00110")} title={t("P00111")}>
          {t("P00112")}
        </PageIntro>
        <PreferencesForm />
      </main>
    </PointsPage>
  );
}

function PreferencesForm() {
  const { preferences, savePreferences } = usePointsPreferences();
  const { t } = useI18n();
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
          <h2 className="m-0 text-lg font-semibold">{t("P00113")}</h2>
          <p className="m-0 mt-1 text-sm text-[var(--muted)]">{t("P00114")}</p>
        </div>
      </div>
      <fieldset className="grid gap-4 border-0 p-0">
        <legend className="sr-only">{t("P00115")}</legend>
        <label className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-[var(--border)] p-4">
          <span>
            <strong className="block">{t("P00116")}</strong>
            <span className="text-sm text-[var(--muted)]">{t("P00117")}</span>
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
            <strong className="block">{t("P00118")}</strong>
            <span className="text-sm text-[var(--muted)]">{t("P00119")}</span>
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
        <Button type="submit">{t("P00120")}</Button>
        {saved ? (
          <p className="m-0 flex items-center gap-2 text-sm" role="status">
            <Check
              aria-hidden="true"
              className="size-4 text-[var(--primary)]"
            />{" "}
            {t("P00121")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
