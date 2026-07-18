"use client";

import { t, type Locale, type MessageCode, type MessageParams } from "@poker/i18n";
import { createContext, useContext, type ReactNode } from "react";

type LocaleContextValue = { readonly locale: Locale; readonly t: (code: MessageCode, params?: MessageParams) => string };

const LocaleContext = createContext<LocaleContextValue>({ locale: "en", t: (code, params) => t("en", code, params) });

export function LocaleProvider({ children, locale }: { children: ReactNode; locale: Locale }) {
  return <LocaleContext.Provider value={{ locale, t: (code, params) => t(locale, code, params) }}>{children}</LocaleContext.Provider>;
}

export function I18nProvider({ children, initialLocale = "en" }: { children: ReactNode; initialLocale?: Locale }) {
  return <LocaleProvider locale={initialLocale}>{children}</LocaleProvider>;
}

export function useI18n(): LocaleContextValue {
  return useContext(LocaleContext);
}
