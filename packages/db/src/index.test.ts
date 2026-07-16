import { describe, expect, it } from "vitest";

import * as publicDatabaseApi from "./index.js";

describe("database package public surface", () => {
  it("does not expose the unrestricted Prisma client", () => {
    expect("prisma" in publicDatabaseApi).toBe(false);
  });
});
