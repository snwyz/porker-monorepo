import { dictionaries } from "./messages.js";
import type { MessageCode, MessageParams } from "./messages.js";
import type { Locale } from "./locale.js";

type TranslationLocale = Locale;
type TranslationCode = MessageCode;
type TranslationParams = MessageParams;

type Translator = (
  locale: TranslationLocale,
  code: TranslationCode,
  params?: TranslationParams,
) => string;

export const t: Translator = (locale, code, params = {}) => {
  const template = dictionaries[locale][code];
  if (template === undefined) {
    throw new Error(`Unknown message code: ${code}`);
  }

  return template.replace(/\{(\d+)\}/g, (token, rawIndex: string) => {
    const index = Number(rawIndex);
    const value = params[index];
    if (value === undefined) {
      throw new Error(`${code} requires ${token}`);
    }

    return String(value);
  });
};
