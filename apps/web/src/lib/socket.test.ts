import { describe, expect, it } from "vitest";
import { ClientLeaveSchema, ClientPlayerActionSchema } from "./socket";

describe("points client action schemas", () => {
  it("requires client action id and authoritative expected version", () => {
    expect(
      ClientPlayerActionSchema.parse({
        roomId: "room-1",
        handId: "hand-1",
        actionId: "browser-action-1",
        expectedVersion: 4,
        type: "call",
      }),
    ).toMatchObject({ actionId: "browser-action-1", expectedVersion: 4 });

    expect(() =>
      ClientPlayerActionSchema.parse({
        roomId: "room-1",
        handId: "hand-1",
        actionId: "server:timeout:hand-1:4",
        expectedVersion: 4,
        type: "call",
      }),
    ).toThrow();
  });

  it("keeps leave requests to roomId and a client actionId", () => {
    expect(
      ClientLeaveSchema.parse({ roomId: "room-1", actionId: "leave-1" }),
    ).toEqual({ roomId: "room-1", actionId: "leave-1" });
    expect(() =>
      ClientLeaveSchema.parse({
        roomId: "room-1",
        actionId: "leave-1",
        wallet: "0x1",
      }),
    ).not.toThrow();
    expect(
      Object.keys(
        ClientLeaveSchema.parse({
          roomId: "room-1",
          actionId: "leave-1",
          wallet: "0x1",
        }),
      ),
    ).toEqual(["roomId", "actionId"]);
  });
});
