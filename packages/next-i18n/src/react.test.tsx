// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { LocaleSwitcher } from "./locale-switcher";
import { I18nProvider, useI18n } from "./provider";

afterEach(() => {
  cleanup();
  document.cookie = "poker_locale=; Max-Age=0; Path=/";
  document.documentElement.lang = "en";
});

function FoldButton() {
  const { t } = useI18n();
  return <button type="button">{t("P000043")}</button>;
}

describe("I18nProvider", () => {
  it("uses the initial locale and persists a language change", async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider initialLocale="zh-CN">
        <FoldButton />
        <LocaleSwitcher />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "弃牌" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "英语" }));

    expect(screen.getByRole("button", { name: "Fold" })).toBeVisible();
    expect(document.cookie).toContain("poker_locale=en");
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
  });

  it("catalogues the language switcher labels", () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <LocaleSwitcher />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "英语" })).toBeVisible();
    expect(screen.getByRole("button", { name: "中文" })).toBeVisible();
  });

  it("prefers the locale stored in the cookie", async () => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["en-US", "zh-CN"],
    });
    document.cookie = "poker_locale=zh-CN; Path=/";

    render(
      <I18nProvider>
        <FoldButton />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "弃牌" })).toBeVisible();
    await waitFor(() => expect(document.documentElement.lang).toBe("zh-CN"));
  });

  it("uses the first supported navigator language when no cookie is stored", async () => {
    Object.defineProperty(navigator, "languages", {
      configurable: true,
      value: ["en-US", "zh-CN"],
    });

    render(
      <I18nProvider>
        <FoldButton />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Fold" })).toBeVisible();
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
  });
});
