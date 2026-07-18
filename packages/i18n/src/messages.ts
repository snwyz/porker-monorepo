import enJson from "./locales/en.json" with { type: "json" };
import zhCNJson from "./locales/zh-CN.json" with { type: "json" };

import type { Locale } from "./locale.js";

export type MessageCode = `P${number}`;
export type MessageParams = Record<number, string | number>;
export type Dictionary = Readonly<Partial<Record<MessageCode, string>>>;
export type Dictionaries = Readonly<Record<Locale, Dictionary>>;

export const dictionaries: Dictionaries = {
  en: enJson,
  "zh-CN": zhCNJson,
};

function placeholderTokens(template: string): number[] {
  return [...template.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1]));
}

function sameNumbers(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function validateDictionaries(zh: Dictionary, en: Dictionary): void {
  const zhCodes = Object.keys(zh);
  const enCodes = Object.keys(en);

  for (const code of [...zhCodes, ...enCodes]) {
    if (!/^P(?!000000$)\d{6}$/.test(code)) {
      throw new Error(`Invalid message code: ${code}`);
    }
  }

  if (
    zhCodes.length !== enCodes.length ||
    zhCodes.some((code) => !Object.hasOwn(en, code))
  ) {
    throw new Error("Dictionary keys do not match");
  }

  for (const code of zhCodes as MessageCode[]) {
    const zhTemplate = zh[code];
    const enTemplate = en[code];
    if (zhTemplate === undefined || enTemplate === undefined) {
      throw new Error("Dictionary keys do not match");
    }

    const zhPlaceholders = [...new Set(placeholderTokens(zhTemplate))].sort(
      (left, right) => left - right,
    );
    const enPlaceholders = [...new Set(placeholderTokens(enTemplate))].sort(
      (left, right) => left - right,
    );
    if (!sameNumbers(zhPlaceholders, enPlaceholders)) {
      throw new Error(`${code} placeholders do not match`);
    }
  }
}

validateDictionaries(dictionaries["zh-CN"], dictionaries.en);
