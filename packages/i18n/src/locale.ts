export type Locale = "en" | "zh-CN";

export function localePathname(locale: Locale, pathname: string): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const withoutLocale = normalized.replace(/^\/zh-CN(?=\/|$)/, "") || "/";
  return locale === "zh-CN" ? `/zh-CN${withoutLocale}` : withoutLocale;
}

export function localeFromPathname(pathname: string): Locale {
  return /^\/zh-CN(?=\/|$)/.test(pathname) ? "zh-CN" : "en";
}

export function normalizeLocale(value: string | undefined): Locale {
  const languages = value
    ?.split(",")
    .map((language) => language.split(";", 1)[0]?.trim().toLowerCase())
    .filter((language): language is string => Boolean(language));

  if (
    languages?.some((language) => language === "zh-cn" || language === "zh")
  ) {
    return "zh-CN";
  }

  return "en";
}
