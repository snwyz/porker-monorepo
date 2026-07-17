"use client";

import { useI18n } from "./provider";

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <fieldset aria-label={t("P00085")} className="m-0 flex gap-1 border-0 p-0">
      <button
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
        type="button"
      >
        {t("P00165")}
      </button>
      <button
        aria-pressed={locale === "zh-CN"}
        onClick={() => setLocale("zh-CN")}
        type="button"
      >
        {t("P00166")}
      </button>
    </fieldset>
  );
}
