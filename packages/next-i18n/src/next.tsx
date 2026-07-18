"use client";

import { localePathname, type Locale } from "@poker/i18n";
import Link, { type LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AnchorHTMLAttributes, ReactNode } from "react";

import { writeLocaleCookie } from "./browser.js";
import { useI18n } from "./react.js";

type LocaleLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & Pick<LinkProps, "prefetch" | "replace" | "scroll"> & { readonly children: ReactNode; readonly href: string };

export function LocaleLink({ href, ...props }: LocaleLinkProps) {
  const { locale } = useI18n();
  return <Link href={localePathname(locale, href)} {...props} />;
}

export function LocaleSwitcher() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const changeLocale = (nextLocale: Locale) => {
    writeLocaleCookie(nextLocale);
    router.replace(localePathname(nextLocale, pathname));
  };
  return <fieldset aria-label={t("P000085")} className="m-0 flex gap-1 border-0 p-0"><button aria-pressed={locale === "en"} onClick={() => changeLocale("en")} type="button">{t("P000165")}</button><button aria-pressed={locale === "zh-CN"} onClick={() => changeLocale("zh-CN")} type="button">{t("P000166")}</button></fieldset>;
}
