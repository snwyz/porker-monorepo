/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { describe, expect, it, vi } from "vitest";

import { createAgentsCli, createDefaultAgentsCli } from "./cli.js";
import type { AgentProvider } from "./provider.js";

describe("agents CLI", () => {
  const entry = {
    "zh-CN": "剩余 {0} 秒",
    code: "P000001",
    params: [0],
    sources: ["apps/poker-web/src/clock.ts:12"],
  };
  const proposal = {
    ...entry,
    en: "{0} seconds remaining",
  };
  const input = JSON.stringify([entry]);

  it("wires the default translation command through the runner and injected provider adapter", async () => {
    const provider: AgentProvider = {
      id: "codex-cli",
      model: "codex-test",
      isAvailable: vi.fn().mockResolvedValue(true),
      execute: vi.fn().mockResolvedValue([proposal]),
    };
    const run = vi.fn().mockResolvedValue({
      provider: "codex-cli",
      model: "codex-test",
      value: [proposal],
    });
    const createRunner = vi.fn().mockReturnValue({ run });
    const writeFile = vi.fn();
    const cli = createDefaultAgentsCli({
      providers: [provider],
      createRunner,
      readFile: vi.fn().mockResolvedValue(input),
      writeFile,
      stdout: vi.fn(),
      confirm: vi.fn(),
    });

    await cli.run([
      "run",
      "translation",
      "--provider",
      "auto",
      "--input",
      "catalog.json",
      "--output",
      "proposal.json",
    ]);

    expect(createRunner).toHaveBeenCalledWith(
      expect.objectContaining({ providers: [provider] }),
    );
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "auto",
        prompt: expect.stringContaining(
          "Preserve every positional placeholder token",
        ),
      }),
    );
    expect(writeFile).toHaveBeenCalledWith("proposal.json", expect.any(String));
    expect(JSON.parse(writeFile.mock.calls[0]?.[1] as string)).toMatchObject({
      status: "PENDING_REVIEW",
      proposals: [proposal],
    });
  });

  it("does not execute a paid fallback when Codex becomes unavailable after preparation", async () => {
    const codex: AgentProvider = {
      id: "codex-cli",
      model: "codex-test",
      isAvailable: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
      execute: vi.fn(),
    };
    const executePaidFallback = vi.fn();
    const anthropic: AgentProvider = {
      id: "anthropic",
      model: "claude-test",
      isAvailable: vi.fn().mockResolvedValue(true),
      execute: executePaidFallback,
    };
    const confirm = vi.fn().mockResolvedValue(false);
    const writeFile = vi.fn();
    const cli = createDefaultAgentsCli({
      providers: [codex, anthropic],
      readFile: vi.fn().mockResolvedValue(input),
      writeFile,
      stdout: vi.fn(),
      confirm,
    });

    await expect(
      cli.run([
        "run",
        "translation",
        "--provider",
        "auto",
        "--input",
        "catalog.json",
        "--output",
        "proposal.json",
      ]),
    ).rejects.toThrow("Paid fallback requires approval");

    expect(confirm).not.toHaveBeenCalled();
    expect(executePaidFallback).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("requires an explicit output path before reading or invoking a translation job", async () => {
    const readFile = vi.fn();
    const prepareTranslation = vi.fn();
    const cli = createAgentsCli({
      readFile,
      writeFile: vi.fn(),
      stdout: vi.fn(),
      confirm: vi.fn(),
      prepareTranslation,
    });

    await expect(
      cli.run(["run", "translation", "--input", "catalog.json"]),
    ).rejects.toThrow("An explicit --output path is required");
    expect(readFile).not.toHaveBeenCalled();
    expect(prepareTranslation).not.toHaveBeenCalled();
  });

  it("asks before executing a paid fallback without explicit approval", async () => {
    const execute = vi.fn();
    const writeFile = vi.fn();
    const prepareTranslation = vi.fn().mockResolvedValue({
      provider: "anthropic",
      model: "claude-test",
      itemCount: 2,
      requiresPaidFallback: true,
      execute,
    });
    const confirm = vi.fn().mockResolvedValue(false);
    const cli = createAgentsCli({
      readFile: vi.fn().mockResolvedValue("[]"),
      writeFile,
      stdout: vi.fn(),
      confirm,
      prepareTranslation,
    });

    await expect(
      cli.run([
        "run",
        "translation",
        "--provider",
        "auto",
        "--input",
        "catalog.json",
        "--output",
        "proposal.json",
      ]),
    ).rejects.toThrow("Paid fallback was not approved");
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("anthropic/claude-test"),
    );
    expect(execute).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("prints the provider, model, and item count then writes only to the explicit output path", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const stdout = vi.fn();
    const cli = createAgentsCli({
      readFile: vi.fn().mockResolvedValue("[]"),
      writeFile,
      stdout,
      confirm: vi.fn(),
      prepareTranslation: vi.fn().mockResolvedValue({
        provider: "codex-cli",
        model: "codex-local",
        itemCount: 3,
        requiresPaidFallback: false,
        execute: vi.fn().mockResolvedValue({ status: "PENDING_REVIEW" }),
      }),
    });

    await cli.run([
      "run",
      "translation",
      "--provider",
      "auto",
      "--input",
      "catalog.json",
      "--output",
      "proposal.json",
    ]);

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("provider=codex-cli model=codex-local items=3"),
    );
    expect(writeFile).toHaveBeenCalledWith(
      "proposal.json",
      '{\n  "status": "PENDING_REVIEW"\n}\n',
    );
  });

  it("does not write an invalid translation proposal as a review job", async () => {
    const provider: AgentProvider = {
      id: "codex-cli",
      model: "codex-test",
      isAvailable: vi.fn().mockResolvedValue(true),
      execute: vi.fn(),
    };
    const run = vi.fn().mockResolvedValue({
      provider: "codex-cli",
      model: "codex-test",
      value: [{ ...proposal, en: "Seconds remaining" }],
    });
    const writeFile = vi.fn();
    const cli = createDefaultAgentsCli({
      providers: [provider],
      createRunner: vi.fn().mockReturnValue({ run }),
      readFile: vi.fn().mockResolvedValue(input),
      writeFile,
      stdout: vi.fn(),
      confirm: vi.fn(),
    });

    await expect(
      cli.run([
        "run",
        "translation",
        "--input",
        "catalog.json",
        "--output",
        "proposal.json",
      ]),
    ).rejects.toThrow("placeholder mismatch");
    expect(writeFile).not.toHaveBeenCalled();
  });
});
