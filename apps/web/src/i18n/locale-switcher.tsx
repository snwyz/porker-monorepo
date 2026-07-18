"use client";

import { useI18n } from "./provider";
import { localePathname } from "@poker/i18n";

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const changeLocale = (next: "en" | "zh-CN") => {
    setLocale(next);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState(null, "", localePathname(next, current));
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <fieldset aria-label={t("P000085")} className="m-0 flex gap-1 border-0 p-0">
      <button
        aria-pressed={locale === "en"}
        onClick={() => changeLocale("en")}
        type="button"
      >
        {t("P000165")}
      </button>
      <button
        aria-pressed={locale === "zh-CN"}
        onClick={() => changeLocale("zh-CN")}
        type="button"
      >
        {t("P000166")}
      </button>
    </fieldset>
  );
}
