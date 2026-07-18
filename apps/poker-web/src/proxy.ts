import { createLocaleProxy } from "@poker/next-i18n/proxy";

export const proxy = createLocaleProxy();

export const config = { matcher: ["/:path*"] };
