import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "../i18n/provider";

export const metadata: Metadata = {
  title: "Poker Next",
  description: "Authoritative points-mode poker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
