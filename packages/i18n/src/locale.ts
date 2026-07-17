export type Locale = "en" | "zh-CN";

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
