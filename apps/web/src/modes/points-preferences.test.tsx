// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HandHistory } from "../components/poker/hand-history";
import { PlayingCard } from "../components/poker/playing-card";

import {
  DEFAULT_POINTS_PREFERENCES,
  POINTS_PREFERENCES_KEY,
  readPointsPreferences,
} from "./points-preferences";
import { PointsPreferencesProvider } from "./points-preferences-provider";

afterEach(() => window.localStorage.clear());

describe("points preferences", () => {
  it("falls back to versioned defaults for missing, malformed, or stale storage", () => {
    expect(readPointsPreferences(null)).toEqual(DEFAULT_POINTS_PREFERENCES);
    expect(readPointsPreferences("not-json")).toEqual(
      DEFAULT_POINTS_PREFERENCES,
    );
    expect(
      readPointsPreferences(
        JSON.stringify({
          version: 0,
          fourColorSuits: true,
          compactHistory: false,
        }),
      ),
    ).toEqual(DEFAULT_POINTS_PREFERENCES);
  });

  it("exposes saved preferences and applies them to cards and history density", async () => {
    window.localStorage.setItem(
      POINTS_PREFERENCES_KEY,
      JSON.stringify({
        version: 1,
        fourColorSuits: true,
        compactHistory: false,
      }),
    );

    render(
      <PointsPreferencesProvider>
        <PlayingCard card={{ code: "Kd", rank: 13, suit: "diamonds" }} />
        <HandHistory entries={["You checked"]} />
      </PointsPreferencesProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("King of diamonds")).toHaveAttribute(
        "data-suit-tone",
        "gold",
      ),
    );
    expect(screen.getByTestId("desktop-hand-history")).toHaveAttribute(
      "data-history-density",
      "comfortable",
    );
    expect(screen.getByText("You checked").closest("li")).toHaveClass("pb-3");
  });
});
