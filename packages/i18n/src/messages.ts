import catalogJson from "./catalog.json";
import enJson from "./locales/en.json";
import zhCNJson from "./locales/zh-CN.json";

import type { Locale } from "./locale.js";

export type MessageCode = `P${number}`;
export type MessageParams = Record<number, string | number>;
export type Catalog = Readonly<Record<MessageCode, readonly number[]>>;
export type Dictionary = Readonly<Partial<Record<MessageCode, string>>>;
export type Dictionaries = Readonly<Record<Locale, Dictionary>>;

export const catalog: Catalog = catalogJson;
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

export function validateCatalog(
  inputCatalog: Catalog,
  inputDictionaries: Dictionaries,
): void {
  for (const [code, parameterIndexes] of Object.entries(inputCatalog)) {
    if (!/^P\d+$/.test(code)) {
      throw new Error(`Invalid message code: ${code}`);
    }

    const expectedIndexes = [...parameterIndexes].sort(
      (left, right) => left - right,
    );
    if (new Set(expectedIndexes).size !== expectedIndexes.length) {
      throw new Error(`${code} declares duplicate parameter indexes`);
    }

    for (const locale of ["en", "zh-CN"] as const) {
      const template = inputDictionaries[locale][code as MessageCode];
      if (template === undefined) {
        throw new Error(`${locale} is missing ${code}`);
      }

      const actualIndexes = [...new Set(placeholderTokens(template))].sort(
        (left, right) => left - right,
      );
      if (!sameNumbers(expectedIndexes, actualIndexes)) {
        throw new Error(`${locale} placeholders do not match ${code}`);
      }
    }
  }

  for (const locale of ["en", "zh-CN"] as const) {
    for (const code of Object.keys(inputDictionaries[locale])) {
      if (!(code in inputCatalog)) {
        throw new Error(`${locale} defines unknown message code: ${code}`);
      }
    }
  }
}

validateCatalog(catalog, dictionaries);
