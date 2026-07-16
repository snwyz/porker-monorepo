import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoom } from "./api";

describe("room creation client validation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the shared room schema refinements before making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      createRoom({
        name: "Invalid blinds",
        seats: 2,
        smallBlind: 50,
        bigBlind: 25,
        minBuyIn: 100,
        maxBuyIn: 500,
        actionTimeoutSeconds: 30,
      }),
    ).rejects.toThrow("smallBlind must be less than bigBlind");
    expect(fetch).not.toHaveBeenCalled();
  });
});
