"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { localePathname } from "@poker/i18n";
import { useI18n } from "./provider";

type LocaleLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  Pick<LinkProps, "prefetch" | "replace" | "scroll"> & {
    readonly children: ReactNode;
    readonly href: string;
  };

export function LocaleLink({ href, ...props }: LocaleLinkProps) {
  const { locale } = useI18n();
  return <Link href={localePathname(locale, href)} {...props} />;
}
