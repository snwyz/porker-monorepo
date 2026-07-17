// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/provider";
import { ActionPanel } from "./action-panel";

describe("ActionPanel", () => {
  it("maps an action error to a catalogued safe message", () => {
    render(
      <I18nProvider initialLocale="en">
        <ActionPanel
          error="internal database hostname"
          legalActions={[{ type: "fold" }]}
          onAction={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not complete action",
    );
    expect(
      screen.queryByText("internal database hostname"),
    ).not.toBeInTheDocument();
  });
});
