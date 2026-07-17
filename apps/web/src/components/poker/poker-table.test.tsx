// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PokerTable, type TableViewModel } from "./poker-table";

afterEach(cleanup);

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      removeEventListener: vi.fn(),
    })),
  });
});

const fixture: TableViewModel = {
  tableId: "table-1",
  handId: "hand-1",
  phase: "flop",
  version: 3,
  viewerId: "player-1",
  actorId: "player-1",
  currentBet: 40,
  minimumRaise: 20,
  seatCount: 9,
  players: [
    {
      id: "player-1",
      displayName: "You",
      seat: 0,
      stack: 960,
      streetCommitted: 40,
      handCommitted: 80,
      status: "active",
    },
    {
      id: "player-2",
      displayName: "River Fox",
      seat: 4,
      stack: 920,
      streetCommitted: 40,
      handCommitted: 80,
      status: "active",
    },
  ],
  board: [
    { code: "As", rank: 14, suit: "spades" },
    { code: "Th", rank: 10, suit: "hearts" },
    { code: "2c", rank: 2, suit: "clubs" },
  ],
  holeCards: [
    { code: "Kd", rank: 13, suit: "diamonds" },
    { code: "Qs", rank: 12, suit: "spades" },
  ],
  legalActions: [
    { type: "fold" },
    { type: "call", amount: 40 },
    { type: "raise", minAmount: 80, maxAmount: 960 },
  ],
  history: ["River Fox called 40", "You to act"],
  turnSecondsRemaining: 18,
};

describe("PokerTable", () => {
  it("labels cards and active player without color-only meaning", () => {
    render(<PokerTable onAction={vi.fn()} table={fixture} />);

    expect(screen.getByLabelText("Ace of spades")).toBeVisible();
    expect(screen.getByLabelText("King of diamonds")).toBeVisible();
    expect(screen.getByText("Your turn")).toBeVisible();
    expect(
      screen.getByRole("group", { name: "You" }),
    ).toHaveAccessibleDescription("active, your turn");
    expect(
      screen.getByText("Active", { selector: "[data-seat-state]" }),
    ).toBeVisible();
  });

  it("emits typed action intents without mutating its table input", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const original = structuredClone(fixture);

    render(<PokerTable onAction={onAction} table={fixture} />);
    await user.click(screen.getByRole("button", { name: "Raise to 80" }));

    expect(onAction).toHaveBeenCalledWith({ type: "raise", amount: 80 });
    expect(fixture).toEqual(original);
  });

  it("exposes percentage coordinates for all nine seats", () => {
    const players = Array.from({ length: 9 }, (_, seat) => ({
      id: `player-${seat}`,
      displayName: `Player ${seat + 1}`,
      seat,
      stack: 1000,
      streetCommitted: 0,
      handCommitted: 0,
      status: "active" as const,
    }));

    render(
      <PokerTable
        onAction={vi.fn()}
        table={{ ...fixture, actorId: "player-8", players }}
      />,
    );

    const seats = screen.getAllByTestId(/player-seat-/);
    expect(seats).toHaveLength(9);
    expect(screen.getByTestId("player-seat-1")).toHaveAttribute(
      "data-seat-x",
      "27%",
    );
    expect(screen.getByTestId("player-seat-1")).toHaveAttribute(
      "data-seat-y",
      "75%",
    );
    for (const seat of seats) {
      expect(seat).toHaveAttribute("data-seat-x", expect.stringMatching(/%$/));
      expect(seat).toHaveAttribute("data-seat-y", expect.stringMatching(/%$/));
      expect(seat.getAttribute("style")).toMatch(/left: \d+%; top: \d+%/);
    }
  });

  it("keeps mobile actions fixed, history in a compact sheet, and chip values tabular", () => {
    render(<PokerTable onAction={vi.fn()} table={fixture} />);

    expect(screen.getByRole("slider", { name: "Wager slider" })).toBeVisible();
    expect(screen.getAllByLabelText("Amount", { exact: false })).toHaveLength(
      1,
    );
    expect(screen.getByTestId("action-panel")).toHaveClass(
      "fixed",
      "bottom-0",
      "lg:absolute",
    );
    expect(screen.getByRole("button", { name: "Hand history" })).toBeVisible();
    expect(screen.getByTestId("desktop-hand-history")).toHaveClass(
      "hidden",
      "lg:block",
    );
    expect(screen.getByTestId("pot-value")).toHaveClass("tabular-nums");
  });

  it("marks selected actions and errors with text or symbols in addition to color", () => {
    render(
      <PokerTable
        error="Action is no longer legal"
        onAction={vi.fn()}
        selectedAction="call"
        table={fixture}
      />,
    );

    expect(screen.getByRole("button", { name: "Call 40" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Selected")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not complete action",
    );
    expect(screen.getByTestId("action-error-icon")).toBeVisible();
  });

  it("degrades deal, chip, and timer motion for reduced-motion users", () => {
    render(<PokerTable onAction={vi.fn()} table={fixture} />);

    expect(screen.getByLabelText("Ace of spades")).toHaveClass(
      "motion-reduce:animate-none",
      "motion-reduce:transition-none",
    );
    expect(screen.getByTestId("pot-value")).toHaveClass(
      "motion-reduce:transition-none",
    );
    expect(screen.getByRole("timer")).toHaveClass(
      "motion-reduce:transition-none",
    );
  });
});
