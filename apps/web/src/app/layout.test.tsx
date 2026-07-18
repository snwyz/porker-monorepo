import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, headers } = vi.hoisted(() => {
  const get = vi.fn();
  return { get, headers: vi.fn(async () => ({ get })) };
});

vi.mock("next/headers", () => ({ headers }));

import RootLayout from "./layout";

describe("RootLayout", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("uses the locale resolved by the routing middleware", async () => {
    get.mockReturnValue("zh-CN");

    const layout = await RootLayout({ children: <main /> });

    expect(headers).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith("x-poker-locale");
    expect(layout.props.lang).toBe("zh-CN");
    expect(layout.props.children.props.children.props.initialLocale).toBe(
      "zh-CN",
    );
  });

  it("uses English when the middleware did not provide a locale", async () => {
    const layout = await RootLayout({ children: <main /> });

    expect(layout.props.lang).toBe("en");
    expect(
      layout.props.children.props.children.props.initialLocale,
    ).toBe("en");
  });
});
