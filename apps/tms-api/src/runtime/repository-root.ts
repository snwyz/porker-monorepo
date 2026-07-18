import { access } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function findRepositoryRoot(moduleFile: string): Promise<string> {
  let directory = dirname(moduleFile);
  while (true) {
    try {
      await access(join(directory, "pnpm-workspace.yaml"));
      return directory;
    } catch {
      const parent = dirname(directory);
      if (parent === directory) {
        throw new Error("Unable to find repository root");
      }
      directory = parent;
    }
  }
}
