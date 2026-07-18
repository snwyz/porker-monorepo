import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createCandidateCli } from "../src/publication/candidate-cli.js";
import { SnapshotRepository } from "../src/publication/snapshot.repository.js";

describe("candidate CLI", () => {
  it("writes only to explicit candidate targets and reports the Git gate intent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "poker-tms-candidate-cli-"));
    const snapshots = new SnapshotRepository(join(directory, "published"));
    await snapshots.publish({
      version: 1,
      catalog: { P00042: [0] },
      en: { P00042: "{0} seconds remaining" },
      "zh-CN": { P00042: "剩余 {0} 秒" },
    });
    const catalogOutput = join(directory, "candidate", "catalog.json");
    const zhOutput = join(directory, "candidate", "zh-CN.json");
    const stdout = vi.fn();
    const cli = createCandidateCli({ stdout });

    await cli.run([
      "write",
      "--snapshot-dir",
      join(directory, "published"),
      "--catalog-output",
      catalogOutput,
      "--zh-output",
      zhOutput,
    ]);

    await expect(
      import("node:fs/promises").then(({ readFile }) =>
        readFile(catalogOutput, "utf8"),
      ),
    ).resolves.toBe('{\n  "P00042": [\n    0\n  ]\n}\n');
    await expect(
      import("node:fs/promises").then(({ readFile }) =>
        readFile(zhOutput, "utf8"),
      ),
    ).resolves.toBe('{\n  "P00042": "剩余 {0} 秒"\n}\n');
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("git_gate=manual-required"),
    );
  });

  it("requires every input and output path before it reads a snapshot or writes a candidate", async () => {
    const writeCandidate = vi.fn();
    const cli = createCandidateCli({ writeCandidate, stdout: vi.fn() });

    await expect(
      cli.run(["write", "--snapshot-dir", "/snapshots"]),
    ).rejects.toThrow("An explicit --catalog-output path is required");
    expect(writeCandidate).not.toHaveBeenCalled();
  });

  it("does not treat a candidate write as a Git operation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "poker-tms-candidate-cli-"));
    const snapshotDir = join(directory, "published");
    const catalogOutput = join(directory, "candidate", "catalog.json");
    const zhOutput = join(directory, "candidate", "zh-CN.json");
    await writeFile(join(directory, "unrelated.txt"), "unchanged\n");
    const stdout = vi.fn();
    const cli = createCandidateCli({
      stdout,
      writeCandidate: vi.fn().mockResolvedValue({
        target: { catalogFile: catalogOutput, zhFile: zhOutput },
        summary: { version: 1, catalogEntries: 1, zhEntries: 1 },
      }),
    });

    await cli.run([
      "write",
      "--snapshot-dir",
      snapshotDir,
      "--catalog-output",
      catalogOutput,
      "--zh-output",
      zhOutput,
    ]);

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("No Git command was executed."),
    );
  });
});
