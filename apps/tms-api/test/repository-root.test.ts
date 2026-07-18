import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findRepositoryRoot } from "../src/runtime/repository-root.js";

describe("findRepositoryRoot", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ));
  });

  it("finds the workspace root from a compiled TMS API module path", async () => {
    const root = await mkdtemp(join(tmpdir(), "poker-tms-root-"));
    directories.push(root);
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []\n");

    await expect(
      findRepositoryRoot(join(root, "apps/tms-api/dist/src/main.js")),
    ).resolves.toBe(root);
  });
});
