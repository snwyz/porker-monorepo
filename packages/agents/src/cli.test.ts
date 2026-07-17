import { describe, expect, it, vi } from "vitest";

import { createAgentsCli } from "./cli.js";

describe("agents CLI", () => {
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
});
