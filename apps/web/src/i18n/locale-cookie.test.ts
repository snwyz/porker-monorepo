// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { readLocaleCookie } from "./locale-cookie";

describe("readLocaleCookie", () => {
  it("falls back safely when the locale cookie has malformed percent encoding", () => {
    expect(readLocaleCookie("poker_locale=%E0%A4%A")).toBeUndefined();
  });
});
