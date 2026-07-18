"use client";

import {
  normalizeLocale,
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
import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";

const dictionaries = { en, "zh-CN": zhCN } as const;

function translate(locale: Locale, code: MessageCode, params: MessageParams = {}) {
  const template = dictionaries[locale][code as keyof (typeof dictionaries)[typeof locale]];
  if (template === undefined) throw new Error(`Unknown message code: ${code}`);
  return template.replace(/\{(\d+)\}/g, (token, rawIndex: string) => {
    const value = params[Number(rawIndex)];
    if (value === undefined) throw new Error(`${code} requires ${token}`);
    return String(value);
  });
}

type I18nContextValue = {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (code: MessageCode, params?: MessageParams) => string;
};

function preferredLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const cookieLocale = readLocaleCookie();
  if (cookieLocale) return cookieLocale;

  return (
    navigator.languages
      .map((language) => {
        const normalized = language.trim().toLowerCase();
        if (
          normalized === "zh" ||
          normalized === "zh-cn" ||
          normalized === "en" ||
          normalized.startsWith("en-")
        ) {
          return normalizeLocale(language);
        }
        return undefined;
      })
      .find((locale): locale is Locale => locale !== undefined) ?? "en"
  );
}

const fallback: I18nContextValue = {
  locale: "en",
  setLocale: () => undefined,
  t: (code, params) => translate("en", code, params),
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
      t: (code, params) => translate(locale, code, params),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
