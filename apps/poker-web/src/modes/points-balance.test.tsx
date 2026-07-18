// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { refreshGuest } = vi.hoisted(() => ({ refreshGuest: vi.fn() }));

vi.mock("@/lib/api", () => ({ refreshGuest }));

import { I18nProvider } from "@poker/next-i18n/react";
import { PointsBalanceContent } from "./points-balance";

describe("PointsBalanceContent", () => {
  it("never exposes a failed refresh reason", async () => {
    refreshGuest.mockRejectedValueOnce(new Error("internal database hostname"));

    render(
      <I18nProvider initialLocale="en">
        <PointsBalanceContent />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not refresh points",
      );
    });
    expect(
      screen.queryByText("internal database hostname"),
    ).not.toBeInTheDocument();
  });
});
