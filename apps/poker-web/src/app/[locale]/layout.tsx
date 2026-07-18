import { notFound } from "next/navigation";
import type { Locale } from "@poker/i18n";

import { LocaleProvider } from "@poker/next-i18n/react";
import "../globals.css";

const locales = ["en", "zh-CN"] as const satisfies readonly Locale[];

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale as Locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
