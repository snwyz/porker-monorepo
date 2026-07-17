import { describe, expect, it } from "vitest";
import type { Socket } from "socket.io-client";
import {
  ClientLeaveSchema,
  ClientPlayerActionSchema,
  emitAck,
  formatAckError,
} from "./socket";

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

  it("retries a lost acknowledgement with the exact logical operation payload", async () => {
    const payload = {
      roomId: "room-1",
      handId: "hand-1",
      actionId: "logical-action-1",
      expectedVersion: 2,
      type: "check",
    };
    const attempts: unknown[] = [];
    const socket = {
      timeout: () => ({
        emit: (
          _event: string,
          sent: unknown,
          callback: (
            error: Error | null,
            ack?: { ok: true; version: number },
          ) => void,
        ) => {
          attempts.push(sent);
          if (attempts.length === 1) callback(new Error("ack timeout"));
          else callback(null, { ok: true, version: 3 });
        },
      }),
    } as unknown as Socket;

    await expect(emitAck(socket, "table:action", payload)).resolves.toEqual({
      ok: true,
      version: 3,
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toBe(payload);
    expect(attempts[1]).toBe(payload);
  });

  it("does not retry a definitive validation acknowledgement", async () => {
    let attempts = 0;
    const socket = {
      timeout: () => ({
        emit: (
          _event: string,
          _payload: unknown,
          callback: (error: null, ack: { ok: false; code: string }) => void,
        ) => {
          attempts += 1;
          callback(null, { ok: false, code: "P00187" });
        },
      }),
    } as unknown as Socket;

    await expect(
      emitAck(socket, "table:leave", {
        roomId: "room-1",
        actionId: "leave-logical-1",
      }),
    ).resolves.toEqual({ ok: false, code: "P00187" });
    expect(attempts).toBe(1);
  });

  it("formats stable socket error codes with the current locale", () => {
    expect(formatAckError({ ok: false, code: "P00176" }, "zh-CN")).toBe(
      "无法加入此牌桌",
    );
  });
});
