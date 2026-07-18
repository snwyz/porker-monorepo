import { CircleDollarSign, Settings2, Spade } from "lucide-react";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "../i18n/locale-switcher";
import { LocaleLink } from "../i18n/locale-link";
import { useI18n } from "../i18n/provider";
import styles from "./points-entry.module.css";
import { PointsPreferencesProvider } from "./points-preferences-provider";

const navigation = [
  { href: "/lobby", code: "P000081", icon: Spade },
  { href: "/balance", code: "P000082", icon: CircleDollarSign },
  { href: "/settings", code: "P000083", icon: Settings2 },
] as const;

export function PointsNavigation({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t("P000084")}
      className="flex flex-wrap items-center gap-1 sm:gap-2"
    >
      {navigation.map(({ href, icon: Icon, code }) => (
        <LocaleLink
          className={`inline-flex items-center justify-center gap-2 rounded-lg border border-transparent font-semibold text-[var(--text)] no-underline outline-none transition-colors hover:bg-[var(--surface-raised)] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${compact ? "min-h-9 px-3 py-1.5 text-xs" : "min-h-10 px-4 py-2 text-sm"}`}
          href={href}
          key={href}
        >
          <Icon aria-hidden="true" />
          <span className={compact ? "sr-only sm:not-sr-only" : undefined}>
            {t(code)}
          </span>
        </LocaleLink>
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
    <PointsPreferencesProvider>
      <div className="min-h-dvh">
        <header
          className={`${table ? styles.shortTableHeader : ""} border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] backdrop-blur`}
        >
          <div className="mx-auto flex w-[min(100%-2rem,90rem)] items-center justify-between gap-3 py-3">
            <LocaleLink
              className="flex min-h-10 items-center gap-2 rounded-lg text-[var(--text)] no-underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              href="/lobby"
            >
              <span className="grid size-9 place-items-center rounded-full border border-[var(--primary)] bg-[var(--walnut)] text-[var(--primary)]">
                <Spade aria-hidden="true" className="size-4" />
              </span>
              <span className="hidden font-semibold tracking-wide sm:inline">
                Poker Next
              </span>
            </LocaleLink>
            <div className="flex items-center gap-2">
              <LocaleSwitcher />
              <PointsNavigation compact={table} />
            </div>
          </div>
        </header>
        <div className={table ? "w-full" : undefined}>{children}</div>
      </div>
    </PointsPreferencesProvider>
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
