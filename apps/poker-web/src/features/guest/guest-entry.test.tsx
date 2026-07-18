// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { createGuest } = vi.hoisted(() => ({ createGuest: vi.fn() }));

vi.mock("@/lib/api", () => ({ createGuest }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { GuestEntry } from "./guest-entry";

describe("GuestEntry", () => {
  it("never exposes a server-provided failure reason", async () => {
    const user = userEvent.setup();
    createGuest.mockRejectedValueOnce(new Error("internal database hostname"));

    render(<GuestEntry />);
    await user.type(screen.getByLabelText("Nickname"), "RiverFox");
    await user.click(screen.getByRole("button", { name: "Play as guest" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Could not enter");
    });
    expect(
      screen.queryByText("internal database hostname"),
    ).not.toBeInTheDocument();
  });
});
