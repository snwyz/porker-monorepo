import { CircleDollarSign, Settings2, Spade } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./points-entry.module.css";

const navigation = [
  { href: "/lobby", label: "Tables", icon: Spade },
  { href: "/balance", label: "Balance", icon: CircleDollarSign },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function PointsNavigation({ compact = false }: { compact?: boolean }) {
  return (
    <nav
      aria-label="Primary"
      className="flex flex-wrap items-center gap-1 sm:gap-2"
    >
      {navigation.map(({ href, icon: Icon, label }) => (
        <Link
          className={`inline-flex items-center justify-center gap-2 rounded-lg border border-transparent font-semibold text-[var(--text)] no-underline outline-none transition-colors hover:bg-[var(--surface-raised)] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${compact ? "min-h-9 px-3 py-1.5 text-xs" : "min-h-10 px-4 py-2 text-sm"}`}
          href={href}
          key={href}
        >
          <Icon aria-hidden="true" />
          <span className={compact ? "sr-only sm:not-sr-only" : undefined}>
            {label}
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function PointsPage({
  children,
  table = false,
}: {
  children: ReactNode;
  table?: boolean;
}) {
  return (
    <div className="min-h-dvh">
      <header
        className={`${table ? styles.shortTableHeader : ""} border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] backdrop-blur`}
      >
        <div className="mx-auto flex w-[min(100%-2rem,90rem)] items-center justify-between gap-3 py-3">
          <Link
            className="flex min-h-10 items-center gap-2 rounded-lg text-[var(--text)] no-underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            href="/lobby"
          >
            <span className="grid size-9 place-items-center rounded-full border border-[var(--primary)] bg-[var(--walnut)] text-[var(--primary)]">
              <Spade aria-hidden="true" className="size-4" />
            </span>
            <span className="hidden font-semibold tracking-wide sm:inline">
              Poker Next
            </span>
          </Link>
          <PointsNavigation compact={table} />
        </div>
      </header>
      <div className={table ? "w-full" : undefined}>{children}</div>
    </div>
  );
}

export function PageIntro({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="mb-8 grid gap-3">
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--primary)]">
        {eyebrow}
      </p>
      <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      <div className="max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
        {children}
      </div>
    </header>
  );
}
