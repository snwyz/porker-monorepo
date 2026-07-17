import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoom, formatProblem } from "./api";

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

describe("localized API failures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("formats a stable localized problem instead of serializing the server body", async () => {
    expect(
      formatProblem({ code: "P00170", params: { 0: "nickname" } }, "zh-CN"),
    ).toBe("昵称无效");
  });

  it.each([
    ["name", "房间名称无效"],
    ["seats", "座位无效"],
    ["smallBlind", "小盲注无效"],
    ["bigBlind", "大盲注无效"],
    ["minBuyIn", "最低买入无效"],
    ["maxBuyIn", "最高买入无效"],
    ["actionTimeoutSeconds", "行动时间无效"],
  ])("localizes the %s room validation field in Chinese", (field, expected) => {
    expect(
      formatProblem({ code: "P00170", params: { 0: field } }, "zh-CN"),
    ).toBe(expected);
  });
});
