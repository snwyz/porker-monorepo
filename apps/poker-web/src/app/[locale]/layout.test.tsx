import { describe, expect, it } from "vitest";

import LocaleLayout, { generateStaticParams } from "./layout";

describe("LocaleLayout", () => {
  it("declares the supported locale routes", () => {
    expect(generateStaticParams()).toEqual([{ locale: "en" }, { locale: "zh-CN" }]);
  });

  it("sets the document language from the route parameter", async () => {
    const layout = await LocaleLayout({
      children: <main />,
      params: Promise.resolve({ locale: "zh-CN" }),
    });

    expect(layout.props.lang).toBe("zh-CN");
    expect(layout.props.children.props.children.props.locale).toBe("zh-CN");
  });
});
