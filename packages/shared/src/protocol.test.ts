import { describe, expect, it } from "vitest";
import { PlayerActionSchema } from "./protocol";
import { TableLeaveSchema } from "./table";

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

  it("reserves the server actionId namespace", () => {
    expect(() =>
      PlayerActionSchema.parse({
        roomId: "room-1",
        handId: "hand-1",
        actionId: "server:timeout:hand-1:0",
        expectedVersion: 0,
        type: "fold",
      }),
    ).toThrow();
    expect(() =>
      TableLeaveSchema.parse({
        roomId: "room-1",
        actionId: "server:timeout:hand-1:0",
      }),
    ).toThrow();
  });
});
