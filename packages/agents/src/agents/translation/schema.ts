import { z } from "zod";

import type { ProviderId } from "../../provider.js";

export type TranslationEntry = {
  code: `P${number}`;
  en: string;
  params: number[];
  sources: string[];
};

export type TranslationProposal = TranslationEntry & {
  "zh-CN": string;
};

export type TranslationJob = {
  id: string;
  status: "PENDING_REVIEW";
  proposals: TranslationProposal[];
  provider: ProviderId;
  model: string;
};

const translationCodeSchema = z
  .string()
  .regex(/^P\d+$/, "Translation code must be a P-number")
  .transform((code) => code as TranslationEntry["code"]);

const translationEntryShape = {
  code: translationCodeSchema,
  en: z.string(),
  params: z.array(z.number().int().nonnegative()),
  sources: z.array(z.string()),
};

export const TranslationEntrySchema = z.object(translationEntryShape).strict();

export const TranslationProposalSchema = z
  .object({
    ...translationEntryShape,
    "zh-CN": z.string(),
  })
  .strict();

export const TranslationProposalsSchema = z.array(TranslationProposalSchema);
