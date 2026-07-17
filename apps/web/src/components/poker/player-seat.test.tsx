// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlayerSeat, type PlayerSeatViewModel } from "./player-seat";

const player: PlayerSeatViewModel = {
  id: "river-fox",
  displayName: "River Fox",
  seat: 4,
  stack: 920,
  streetCommitted: 40,
  handCommitted: 80,
  status: "active",
};

describe("PlayerSeat", () => {
  it("renders a player's name only once after consecutive renders", () => {
    const props = { player, position: { x: 50, y: 50 } };
    const { container, rerender } = render(<PlayerSeat {...props} />);

    rerender(<PlayerSeat {...props} />);

    expect(container.innerHTML.match(/River Fox/g)).toHaveLength(1);
  });
});
