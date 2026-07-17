// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { LocaleSwitcher } from "./locale-switcher";
import { I18nProvider, useI18n } from "./provider";

afterEach(() => {
  cleanup();
  document.cookie = "poker_locale=; Max-Age=0; Path=/";
});

function FoldButton() {
  const { t } = useI18n();
  return <button type="button">{t("P00043")}</button>;
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

    await user.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByRole("button", { name: "Fold" })).toBeVisible();
    expect(document.cookie).toContain("poker_locale=en");
  });
});
