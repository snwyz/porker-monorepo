import { describe, expect, it } from "vitest";

import {
  createTranslationPrompt,
  createTranslationJob,
  validateProposal,
  validateProposals,
} from "./index.js";
import type { TranslationEntry } from "./schema.js";

const entry = {
  "zh-CN": "剩余 {0} 秒",
  code: "P000042",
  params: [0],
  sources: ["apps/poker-web/src/clock.ts:12"],
} as TranslationEntry;

const proposal = {
  ...entry,
  en: "{0} seconds remaining",
};

describe("translation proposals", () => {
  it("creates a deterministic schema-only prompt", () => {
    const prompt = createTranslationPrompt([entry]);

    expect(createTranslationPrompt([entry])).toBe(prompt);
    expect(prompt).toContain("Return only a JSON array");
    expect(prompt).toContain("Preserve every positional placeholder token");
    expect(prompt).toContain(JSON.stringify([entry]));
  });

  it("accepts matching positional placeholders", () => {
    expect(validateProposal(proposal)).toEqual(proposal);
  });

  it("rejects an English translation with missing positional placeholders", () => {
    expect(() =>
      validateProposal({ ...proposal, en: "Seconds remaining" }),
    ).toThrow("placeholder mismatch");
  });

  it("rejects missing, extra, duplicate, and reordered proposal codes", () => {
    const alternateEntry = {
      "zh-CN": "已有 {0} 位玩家入座",
      code: "P000043",
      params: [0],
      sources: ["apps/poker-web/src/table.ts:8"],
    } as TranslationEntry;
    const alternateProposal = {
      ...alternateEntry,
      en: "{0} players seated",
    };

    expect(() => validateProposals([entry], [])).toThrow(
      "proposal code mismatch",
    );
    expect(() =>
      validateProposals([entry], [proposal, alternateProposal]),
    ).toThrow("proposal code mismatch");
    expect(() =>
      validateProposals([entry, alternateEntry], [alternateProposal, proposal]),
    ).toThrow("proposal code mismatch");
    expect(() =>
      validateProposals([entry, entry], [proposal, proposal]),
    ).toThrow("duplicate input code");
  });

  it("does not allocate a review job before validating proposals", () => {
    const createId = () => {
      throw new Error("job id should not be allocated");
    };

    expect(() =>
      createTranslationJob({
        entries: [entry],
        proposals: [{ ...proposal, en: "Seconds remaining" }],
        provider: "codex-cli",
        model: "codex-test",
        createId,
      }),
    ).toThrow("placeholder mismatch");
  });

  it("creates a pending review job after validation", () => {
    expect(
      createTranslationJob({
        entries: [entry],
        proposals: [proposal],
        provider: "codex-cli",
        model: "codex-test",
        createId: () => "job-42",
      }),
    ).toEqual({
      id: "job-42",
      status: "PENDING_REVIEW",
      proposals: [proposal],
      provider: "codex-cli",
      model: "codex-test",
    });
  });
});
