/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import type { TranslationEntry } from "./schema.js";

export function createTranslationPrompt(
  entries: readonly TranslationEntry[],
): string {
  const normalizedEntries = entries.map((entry) => ({
    "zh-CN": entry["zh-CN"],
    code: entry.code,
    params: entry.params,
    sources: entry.sources,
  }));

  return [
    "Translate the supplied Simplified Chinese source entries into English.",
    "Return only a JSON array. Do not include Markdown or commentary.",
    "Each item must match this JSON schema:",
    '{"code":"P000001","zh-CN":"中文源文","params":[0],"sources":["source"],"en":"English text"}',
    "Keep every code, Chinese source text, params array, and sources array unchanged and in the same order.",
    "Preserve every positional placeholder token such as {0} exactly in English.",
    "Input:",
    JSON.stringify(normalizedEntries),
  ].join("\n");
}
