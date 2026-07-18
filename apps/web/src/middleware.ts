import { NextResponse, type NextRequest } from "next/server";

const localeCookieName = "poker_locale";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || /\.[^/]+$/.test(pathname)) {
    return NextResponse.next();
  }
  const chinese = pathname === "/zh-CN" || pathname.startsWith("/zh-CN/");
  if (!chinese && request.cookies.get(localeCookieName)?.value === "zh-CN") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = `/zh-CN${pathname}`;
    return NextResponse.redirect(redirect);
  }
  const headers = new Headers(request.headers);
  headers.set("x-poker-locale", chinese ? "zh-CN" : "en");
  if (!chinese) return NextResponse.next({ request: { headers } });
  const rewrite = request.nextUrl.clone();
  rewrite.pathname = pathname.slice("/zh-CN".length) || "/";
  return NextResponse.rewrite(rewrite, { request: { headers } });
}

export const config = { matcher: ["/:path*"] };
