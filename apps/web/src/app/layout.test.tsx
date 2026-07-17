import { describe, expect, it, vi } from "vitest";

const { cookies, get } = vi.hoisted(() => {
  const get = vi.fn();
  return { cookies: vi.fn(async () => ({ get })), get };
});

vi.mock("next/headers", () => ({ cookies }));

import RootLayout from "./layout";

describe("RootLayout", () => {
  it("uses the poker_locale cookie for the initial locale and html lang", async () => {
    get.mockReturnValue({ value: "zh-CN" });

    const layout = await RootLayout({ children: <main /> });

    expect(cookies).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith("poker_locale");
    expect(layout.props.lang).toBe("zh-CN");
    expect(layout.props.children.props.children.props.initialLocale).toBe(
      "zh-CN",
    );
  });
});
