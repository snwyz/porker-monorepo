import { describe, expect, it } from "vitest";

import { isLedgerReferenceUniqueConflict } from "./ledger.js";

describe("ledger error classification", () => {
  it("recognizes only the ledger transaction reference constraint", () => {
    expect(
      isLedgerReferenceUniqueConflict({
        code: "P002002",
        meta: { modelName: "LedgerTransaction", target: ["reference"] },
      }),
    ).toBe(true);
    expect(
      isLedgerReferenceUniqueConflict({
        code: "P002002",
        meta: {
          modelName: "LedgerTransaction",
          target: "LedgerTransaction_reference_key",
        },
      }),
    ).toBe(true);
    expect(
      isLedgerReferenceUniqueConflict({
        code: "P002002",
        meta: { modelName: "Session", target: ["tokenHash"] },
      }),
    ).toBe(false);
    expect(
      isLedgerReferenceUniqueConflict({
        code: "P002002",
        meta: { modelName: "LedgerTransaction", target: ["id"] },
      }),
    ).toBe(false);
  });
});
