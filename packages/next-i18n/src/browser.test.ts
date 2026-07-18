// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { readLocaleCookie } from "./browser";

describe("readLocaleCookie", () => {
  it("falls back safely when the locale cookie has malformed percent encoding", () => {
    expect(readLocaleCookie("NEXT_LOCALE=%E0%A4%A")).toBeUndefined();
  });
});
