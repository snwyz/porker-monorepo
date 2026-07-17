/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  createAgentRunner,
  type AgentProvider,
  type AgentRunReport,
} from "./index.js";

const ResultSchema = z.object({ translation: z.string() });

function provider(
  id: AgentProvider["id"],
  options: { available?: boolean; model?: string } = {},
): AgentProvider {
  return {
    id,
    model: options.model ?? `${id}-model`,
    isAvailable: vi.fn().mockResolvedValue(options.available ?? true),
    execute: vi.fn().mockResolvedValue({ translation: "已翻译" }),
  };
}

describe("agent runner", () => {
  it("validates agent configuration with Zod", () => {
    expect(() =>
      createAgentRunner({
        config: {
          providerOrder: [],
          allowPaidFallback: false,
          models: {},
        },
        providers: [],
      }),
    ).toThrow();
  });

  it("uses Codex CLI first for automatic selection", async () => {
    const codex = provider("codex-cli");
    const anthropic = provider("anthropic");
    const runner = createAgentRunner({
      config: {
        providerOrder: ["codex-cli", "anthropic"],
        allowPaidFallback: true,
        models: {},
      },
      providers: [codex, anthropic],
      probeCodexCli: vi.fn().mockResolvedValue(true),
    });

    const result = await runner.run({
      prompt: "translate this",
      schema: ResultSchema,
    });

    expect(result).toMatchObject({
      provider: "codex-cli",
      model: "codex-cli-model",
      value: { translation: "已翻译" },
    });
    expect(codex.execute).toHaveBeenCalledOnce();
    expect(anthropic.execute).not.toHaveBeenCalled();
  });

  it("falls back to Anthropic when Codex CLI is unavailable", async () => {
    const runner = createAgentRunner({
      config: {
        providerOrder: ["codex-cli", "anthropic"],
        allowPaidFallback: true,
        models: {},
      },
      providers: [provider("codex-cli"), provider("anthropic")],
      probeCodexCli: vi.fn().mockResolvedValue(false),
    });

    await expect(
      runner.run({ prompt: "translate this", schema: ResultSchema }),
    ).resolves.toMatchObject({
      provider: "anthropic",
      fallbackReason: "codex-cli unavailable",
    });
  });

  it("requires approval before using a paid fallback", async () => {
    const runner = createAgentRunner({
      config: {
        providerOrder: ["codex-cli", "anthropic"],
        allowPaidFallback: false,
        models: {},
      },
      providers: [provider("codex-cli"), provider("anthropic")],
      probeCodexCli: vi.fn().mockResolvedValue(false),
    });

    await expect(
      runner.run({ prompt: "translate this", schema: ResultSchema }),
    ).rejects.toThrow("Paid fallback requires approval");
  });

  it("rejects an unavailable forced provider", async () => {
    const runner = createAgentRunner({
      config: {
        providerOrder: ["codex-cli", "anthropic"],
        allowPaidFallback: true,
        models: {},
      },
      providers: [
        provider("codex-cli"),
        provider("anthropic", { available: false }),
      ],
      probeCodexCli: vi.fn().mockResolvedValue(true),
    });

    await expect(
      runner.run({
        prompt: "translate this",
        schema: ResultSchema,
        provider: "anthropic",
      }),
    ).rejects.toThrow("Provider anthropic unavailable");
  });

  it("emits a report without prompts, results, or credentials", async () => {
    const reports: AgentRunReport[] = [];
    const runner = createAgentRunner({
      config: {
        providerOrder: ["codex-cli"],
        allowPaidFallback: false,
        models: {},
      },
      providers: [provider("codex-cli")],
      probeCodexCli: vi.fn().mockResolvedValue(true),
      report: (entry) => reports.push(entry),
    });

    await runner.run({ prompt: "secret prompt", schema: ResultSchema });

    expect(reports).toHaveLength(1);
    expect(Object.keys(reports[0] ?? {}).sort()).toEqual([
      "duration",
      "fallbackReason",
      "model",
      "provider",
      "status",
    ]);
    expect(JSON.stringify(reports)).not.toContain("secret prompt");
    expect(JSON.stringify(reports)).not.toContain("translation");
  });
});
