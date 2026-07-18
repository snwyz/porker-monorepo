import { describe, expect, it } from "vitest";

import * as i18n from "./index";

type TranslationApi = {
  readonly normalizeLocale?: (value: string | undefined) => unknown;
  readonly validateDictionaries?: (
    zh: Record<`P${number}`, string>,
    en: Record<`P${number}`, string>,
  ) => void;
  readonly t?: (
    locale: "en" | "zh-CN",
    code: `P${number}`,
    params?: Record<number, string | number>,
  ) => string;
};

const api = i18n as TranslationApi;

describe("t", () => {
  it("formats the English P000042 message with its seconds parameter", () => {
    expect(api.t?.("en", "P000042", { 0: 15 })).toBe("15 seconds remaining");
  });

  it("formats the Chinese P000042 message with its seconds parameter", () => {
    expect(api.t?.("zh-CN", "P000042", { 0: 15 })).toBe("剩余 15 秒");
  });

  it("rejects a missing required placeholder parameter", () => {
    expect(() => api.t?.("en", "P000042")).toThrow("P000042 requires {0}");
  });

  it("rejects an unknown message code", () => {
    expect(() => api.t?.("en", "P999999")).toThrow(
      "Unknown message code: P999999",
    );
  });

  it("normalizes an Accept-Language header preferring simplified Chinese", () => {
    expect(api.normalizeLocale?.("zh-CN,zh;q=0.9")).toBe("zh-CN");
  });

  it("rejects dictionaries with inconsistent message keys", () => {
    expect(() =>
      api.validateDictionaries?.(
        { P000042: "剩余 {0} 秒" },
        { P000043: "{0} seconds remaining" },
      ),
    ).toThrow("Dictionary keys do not match");
  });

  it("rejects message codes below P000001", () => {
    expect(() =>
      api.validateDictionaries?.(
        { P000000: "无效编号" },
        { P000000: "Invalid code" },
      ),
    ).toThrow("Invalid message code: P000000");
  });

  it("rejects dictionaries with inconsistent placeholders", () => {
    expect(() =>
      api.validateDictionaries?.(
        { P000042: "剩余 {0} 秒" },
        { P000042: "{1} seconds remaining" },
      ),
    ).toThrow("P000042 placeholders do not match");
  });
});
