import { describe, expect, it } from "vitest";

import { resolveLoopbackHost } from "../src/main.js";

describe("TMS API listener host", () => {
  it("accepts only explicit loopback hosts", () => {
    expect(resolveLoopbackHost("127.0.0.1")).toBe("127.0.0.1");
    expect(resolveLoopbackHost("::1")).toBe("::1");
    expect(resolveLoopbackHost("localhost")).toBe("localhost");
  });

  it("rejects a public listener before listen", () => {
    expect(() => resolveLoopbackHost("0.0.0.0")).toThrow(
      "HOST must be a loopback address",
    );
  });
});
