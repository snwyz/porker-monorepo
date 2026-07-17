import { normalizeLocale, type Locale } from "@poker/i18n";

type CookieRequest = {
  cookies?: Record<string, unknown>;
  headers?: {
    cookie?: string | string[] | undefined;
    "accept-language"?: string | string[] | undefined;
  };
};

function cookieValue(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value.join(";") : value;
  const encoded = header
    ?.split(";")
    .map((part) => part.trim().split("=", 2))
    .find(([name]) => name === "poker_locale")?.[1];
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(",") : value;
}

export function localeFromRequest(request: CookieRequest): Locale {
  const cookie = request.cookies?.poker_locale;
  if (typeof cookie === "string") return normalizeLocale(cookie);
  return normalizeLocale(
    cookieValue(request.headers?.cookie) ??
      headerValue(request.headers?.["accept-language"]),
  );
}

export function localeFromSocketHandshake(handshake: {
  headers: CookieRequest["headers"];
}): Locale {
  return localeFromRequest({ headers: handshake.headers });
}
