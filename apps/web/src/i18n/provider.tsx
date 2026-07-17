"use client";

import {
  normalizeLocale,
  t,
  type Locale,
  type MessageCode,
  type MessageParams,
} from "@poker/i18n";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { readLocaleCookie, writeLocaleCookie } from "./locale-cookie";

type I18nContextValue = {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (code: MessageCode, params?: MessageParams) => string;
};

function preferredLocale(): Locale {
  if (typeof document === "undefined") return "en";
  return readLocaleCookie() ?? normalizeLocale(navigator.languages.join(","));
}

const fallback: I18nContextValue = {
  locale: "en",
  setLocale: () => undefined,
  t: (code, params) => t("en", code, params),
};
const I18nContext = createContext<I18nContextValue>(fallback);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(
    () => initialLocale ?? preferredLocale(),
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => {
        setLocale(nextLocale);
        writeLocaleCookie(nextLocale);
      },
      t: (code, params) => t(locale, code, params),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
