import { describe, expect, it } from "vitest";
import { PlayerActionSchema } from "./protocol";

describe("PlayerActionSchema", () => {
  it("rejects a raise without a positive integer amount", () => {
    expect(() =>
      PlayerActionSchema.parse({
        roomId: "room-1",
        handId: "hand-1",
        actionId: "action-1",
        expectedVersion: 4,
        type: "raise",
        amount: 0,
      }),
    ).toThrow();
  });
});
