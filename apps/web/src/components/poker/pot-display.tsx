"use client";

import { Coins } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { useI18n } from "../../i18n/provider";

export function PotDisplay({ amount }: { readonly amount: number }) {
  const reduceMotion = useReducedMotion();
  const { t } = useI18n();

  return (
    <div
      aria-label={t("P000054", { 0: amount })}
      className="flex items-center justify-center gap-1.5 rounded-full border border-[var(--primary)]/50 bg-black/25 px-3 py-1 text-xs shadow sm:text-sm"
    >
      <Coins aria-hidden="true" className="size-4 text-[var(--primary)]" />
      <span>{t("P000055")}</span>
      <motion.strong
        animate={{ opacity: 1 }}
        className="tabular-nums text-[var(--primary)] transition-transform motion-reduce:transition-none"
        data-testid="pot-value"
        initial={reduceMotion ? false : { opacity: 0.6 }}
        key={amount}
        transition={{ duration: reduceMotion ? 0 : 0.18 }}
      >
        {amount.toLocaleString("en-US")}
      </motion.strong>
    </div>
  );
}
