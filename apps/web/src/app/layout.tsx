import type { Metadata } from "next";
import { cookies } from "next/headers";
import { normalizeLocale } from "@poker/i18n";
import "./globals.css";
import { I18nProvider } from "../i18n/provider";
import { localeCookieName } from "../i18n/locale-cookie";

export const metadata: Metadata = {
  title: "Poker Next",
  description: "Authoritative points-mode poker",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;
  const initialLocale = cookieLocale
    ? normalizeLocale(cookieLocale)
    : undefined;

  return (
    <html lang={initialLocale ?? "en"}>
      <body>
        <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
