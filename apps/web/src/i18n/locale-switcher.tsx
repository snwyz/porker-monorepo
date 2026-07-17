"use client";

import { useI18n } from "./provider";

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div aria-label={t("P00085")} className="flex items-center gap-1">
      <button
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
        type="button"
      >
        EN
      </button>
      <button
        aria-pressed={locale === "zh-CN"}
        onClick={() => setLocale("zh-CN")}
        type="button"
      >
        中文
      </button>
    </div>
  );
}
