import type { Locale } from "@poker/i18n";
import { NextResponse, type NextRequest } from "next/server";

export function createLocaleProxy(locales: readonly Locale[] = ["en", "zh-CN"]) {
  return function localeProxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith("/_next") || pathname.startsWith("/api") || /\.[^/]+$/.test(pathname)) return NextResponse.next();
    const hasLocale = locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
    if (hasLocale) return NextResponse.next();
    const redirect = request.nextUrl.clone();
    const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
    const locale = locales.includes(cookieLocale as Locale) ? (cookieLocale as Locale) : (locales[0] ?? "en");
    redirect.pathname = `/${locale}${pathname}`;
    return NextResponse.redirect(redirect);
  };
}
