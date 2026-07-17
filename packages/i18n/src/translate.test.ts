import { describe, expect, it } from "vitest";

import * as i18n from "./index";

type TranslationApi = {
  readonly normalizeLocale?: (value: string | undefined) => unknown;
  readonly t?: (
    locale: "en" | "zh-CN",
    code: `P${number}`,
    params?: Record<number, string | number>,
  ) => string;
};

const api = i18n as TranslationApi;

describe("t", () => {
  it("formats the English P00042 message with its seconds parameter", () => {
    expect(api.t?.("en", "P00042", { 0: 15 })).toBe("15 seconds remaining");
  });

  it("formats the Chinese P00042 message with its seconds parameter", () => {
    expect(api.t?.("zh-CN", "P00042", { 0: 15 })).toBe("剩余 15 秒");
  });

  it("rejects a missing required placeholder parameter", () => {
    expect(() => api.t?.("en", "P00042")).toThrow("P00042 requires {0}");
  });

  it("rejects an unknown message code", () => {
    expect(() => api.t?.("en", "P99999")).toThrow(
      "Unknown message code: P99999",
    );
  });

  it("normalizes an Accept-Language header preferring simplified Chinese", () => {
    expect(api.normalizeLocale?.("zh-CN,zh;q=0.9")).toBe("zh-CN");
  });
});
