import type { Metadata } from "next";
import { headers } from "next/headers";
import { normalizeLocale } from "@poker/i18n";
import "./globals.css";
import { I18nProvider } from "../i18n/provider";

export const metadata: Metadata = {
  title: "Poker Next",
  description: "Authoritative points-mode poker",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const initialLocale = normalizeLocale(requestHeaders.get("x-poker-locale") ?? undefined);

  return (
    <html lang={initialLocale ?? "en"}>
      <body>
        <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
