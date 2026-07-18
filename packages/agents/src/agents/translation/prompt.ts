/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import type { TranslationEntry } from "./schema.js";

export function createTranslationPrompt(
  entries: readonly TranslationEntry[],
): string {
  const normalizedEntries = entries.map((entry) => ({
    code: entry.code,
    en: entry.en,
    params: entry.params,
    sources: entry.sources,
  }));

  return [
    "Translate the supplied English catalog entries into Simplified Chinese.",
    "Return only a JSON array. Do not include Markdown or commentary.",
    "Each item must match this JSON schema:",
    '{"code":"P000001","en":"English text","params":[0],"sources":["source"],"zh-CN":"Chinese text"}',
    "Keep every code, English text, params array, and sources array unchanged and in the same order.",
    "Preserve every positional placeholder token such as {0} exactly in zh-CN.",
    "Input:",
    JSON.stringify(normalizedEntries),
  ].join("\n");
}
