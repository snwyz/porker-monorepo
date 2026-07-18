// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider, useI18n } from "./react";

function FoldButton() {
  const { t } = useI18n();
  return <button type="button">{t("P000043")}</button>;
}

describe("I18nProvider", () => {
  it("uses the locale supplied by the route layout", () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <FoldButton />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "弃牌" })).toBeVisible();
  });
});
