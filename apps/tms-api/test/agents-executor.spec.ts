import { describe, expect, it, vi } from "vitest";

import { createAgentTranslationExecutor } from "../src/translations/agents.executor.js";

const entries = [
  {
    code: "P00042" as const,
    en: "{0} seconds remaining",
    params: [0],
    sources: ["packages/i18n/src/locales/en.json"],
  },
];

describe("agent translation executor", () => {
  it("runs the @poker/agents runner with an offline provider", async () => {
    const execute = vi.fn().mockResolvedValue([
      { ...entries[0], "zh-CN": "剩余 {0} 秒" },
    ]);
    const executor = createAgentTranslationExecutor({
      providers: [
        {
          execute,
          id: "codex-cli",
          isAvailable: async () => true,
          model: "offline-codex",
        },
      ],
    });

    await expect(
      executor.translate({ entries, provider: "auto" }),
    ).resolves.toEqual({
      model: "offline-codex",
      proposals: [{ ...entries[0], "zh-CN": "剩余 {0} 秒" }],
      provider: "codex-cli",
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("requires explicit confirmation before a paid provider can run", async () => {
    const execute = vi.fn();
    const executor = createAgentTranslationExecutor({
      providers: [
        {
          execute,
          id: "anthropic",
          isAvailable: async () => true,
          model: "offline-paid",
        },
      ],
    });

    await expect(
      executor.translate({ entries, provider: "anthropic" }),
    ).rejects.toThrow("Paid provider requires explicit confirmation");
    expect(execute).not.toHaveBeenCalled();
  });
});
