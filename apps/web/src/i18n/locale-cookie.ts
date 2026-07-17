import { normalizeLocale, type Locale } from "@poker/i18n";

export const localeCookieName = "poker_locale";

export function readLocaleCookie(cookie = document.cookie): Locale | undefined {
  const value = cookie
    .split(";")
    .map((entry) => entry.trim().split("=", 2))
    .find(([name]) => name === localeCookieName)?.[1];

  return value ? normalizeLocale(decodeURIComponent(value)) : undefined;
}

export function writeLocaleCookie(locale: Locale): void {
  document.cookie = `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
