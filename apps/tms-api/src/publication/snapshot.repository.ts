import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  PublishedSnapshotSchema,
  type PublishedSnapshot,
} from "./snapshot.schema.js";

export type ReplaceFile = (
  source: string,
  destination: string,
) => Promise<void>;

export class SnapshotRepository {
  private readonly currentFile: string;

  constructor(
    directory: string,
    private readonly replace: ReplaceFile = rename,
  ) {
    this.currentFile = join(directory, "current.json");
  }

  async read(): Promise<PublishedSnapshot | undefined> {
    try {
      const source = await readFile(this.currentFile, "utf8");
      return PublishedSnapshotSchema.parse(JSON.parse(source));
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  async publish(snapshot: PublishedSnapshot): Promise<void> {
    const value = PublishedSnapshotSchema.parse(snapshot);
    await mkdir(dirname(this.currentFile), { recursive: true });
    const temporary = join(
      dirname(this.currentFile),
      `.${basename(this.currentFile)}.${randomUUID()}.tmp`,
    );
    try {
      const handle = await open(temporary, "w");
      try {
        await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.replace(temporary, this.currentFile);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}
