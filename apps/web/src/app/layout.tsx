import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
