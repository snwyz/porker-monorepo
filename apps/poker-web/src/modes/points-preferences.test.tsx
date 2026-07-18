// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  it("keeps diamond text at WCAG AA contrast on the card face", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const face = css.match(/--card-face:\s*(#[0-9a-f]{6})/i)?.[1];
    const diamond = css.match(/--card-diamond:\s*(#[0-9a-f]{6})/i)?.[1];

    expect(face).toBeDefined();
    expect(diamond).toBeDefined();
    expect(contrastRatio(face!, diamond!)).toBeGreaterThanOrEqual(4.5);
  });

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
        <PlayingCard card={{ code: "Ac", rank: 14, suit: "clubs" }} />
        <PlayingCard card={{ code: "Kd", rank: 13, suit: "diamonds" }} />
        <PlayingCard card={{ code: "Qh", rank: 12, suit: "hearts" }} />
        <PlayingCard card={{ code: "Js", rank: 11, suit: "spades" }} />
        <PlayingCard card={{ code: "Td", rank: 10, suit: "diamonds" }} />
        <HandHistory entries={["You checked"]} />
      </PointsPreferencesProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("King of diamonds")).toHaveAttribute(
        "data-suit-tone",
        "gold",
      ),
    );
    expect(screen.getByLabelText("Ace of clubs")).toHaveAttribute(
      "data-suit-tone",
      "green",
    );
    expect(screen.getByLabelText("Queen of hearts")).toHaveAttribute(
      "data-suit-tone",
      "red",
    );
    expect(screen.getByLabelText("Jack of spades")).toHaveAttribute(
      "data-suit-tone",
      "ink",
    );
    expect(screen.getByLabelText("10 of diamonds")).toHaveTextContent("10");
    expect(screen.getByTestId("desktop-hand-history")).toHaveAttribute(
      "data-history-density",
      "comfortable",
    );
    expect(screen.getByText("You checked").closest("li")).toHaveClass("pb-3");
  });
});

function contrastRatio(first: string, second: string): number {
  const luminances = [first, second].map((hex) => {
    const channels = [1, 3, 5].map(
      (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
    );
    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  });
  const lighter = Math.max(...luminances);
  const darker = Math.min(...luminances);
  return (lighter + 0.05) / (darker + 0.05);
}
