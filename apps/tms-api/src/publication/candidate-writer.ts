import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  PublishedSnapshotSchema,
  type PublishedSnapshot,
} from "./snapshot.schema.js";
import { type SnapshotRepository } from "./snapshot.repository.js";

export type CandidateTarget = {
  readonly catalogFile: string;
  readonly zhFile: string;
};

export type CandidateWriteResult = {
  readonly target: CandidateTarget;
  readonly summary: {
    readonly version: number;
    readonly catalogEntries: number;
    readonly zhEntries: number;
  };
};

export type ReplaceFile = (
  source: string,
  destination: string,
) => Promise<void>;

export type CandidateWriter = {
  writeCandidate(
    source: SnapshotRepository,
    target: CandidateTarget,
  ): Promise<CandidateWriteResult>;
};

export function createCandidateWriter(
  replace: ReplaceFile = rename,
): CandidateWriter {
  return {
    async writeCandidate(source, target): Promise<CandidateWriteResult> {
      const snapshot = await source.read();
      if (!snapshot) throw new Error("No published snapshot is available");
      const value = PublishedSnapshotSchema.parse(snapshot);
      validateSnapshot(value);
      const [originalCatalog, originalZh] = await Promise.all([
        readOptional(target.catalogFile),
        readOptional(target.zhFile),
      ]);
      try {
        await atomicWrite(target.catalogFile, value.catalog, replace);
        await atomicWrite(target.zhFile, value["zh-CN"], replace);
      } catch (error) {
        await rollback(
          [
            [target.catalogFile, originalCatalog],
            [target.zhFile, originalZh],
          ],
          replace,
          error,
        );
        throw error;
      }
      return {
        target,
        summary: {
          version: value.version,
          catalogEntries: Object.keys(value.catalog).length,
          zhEntries: Object.keys(value["zh-CN"]).length,
        },
      };
    },
  };
}

export const candidateWriter = createCandidateWriter();

export function writeCandidate(
  source: SnapshotRepository,
  target: CandidateTarget,
): Promise<CandidateWriteResult> {
  return candidateWriter.writeCandidate(source, target);
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
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

async function restore(
  file: string,
  original: string | undefined,
  replace: ReplaceFile,
): Promise<void> {
  if (original === undefined) {
    await rm(file, { force: true });
    return;
  }
  await atomicWriteContent(file, original, replace);
}

async function rollback(
  targets: readonly (readonly [string, string | undefined])[],
  replace: ReplaceFile,
  cause: unknown,
): Promise<void> {
  const failures: unknown[] = [];
  for (const [file, original] of targets) {
    try {
      await restore(file, original, replace);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      [cause, ...failures],
      "Candidate generation and rollback failed",
    );
  }
}

async function atomicWrite(
  file: string,
  value: unknown,
  replace: ReplaceFile,
): Promise<void> {
  await atomicWriteContent(
    file,
    `${JSON.stringify(value, null, 2)}\n`,
    replace,
  );
}

async function atomicWriteContent(
  file: string,
  content: string,
  replace: ReplaceFile,
): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = join(
    dirname(file),
    `.${basename(file)}.${randomUUID()}.tmp`,
  );
  try {
    const handle = await open(temporary, "w");
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await replace(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function validateSnapshot(snapshot: PublishedSnapshot): void {
  for (const [code, params] of Object.entries(snapshot.catalog)) {
    const en = snapshot.en[code];
    const zh = snapshot["zh-CN"][code];
    if (en === undefined || zh === undefined) {
      throw new Error(`Snapshot is missing dictionary entry for ${code}`);
    }
    const expected = params.map(String).sort().join(",");
    for (const template of [en, zh]) {
      const actual = [
        ...new Set(
          [...template.matchAll(/\{(\d+)\}/g)].map((match) => match[1]),
        ),
      ]
        .sort()
        .join(",");
      if (actual !== expected) {
        throw new Error(`Snapshot placeholder mismatch for ${code}`);
      }
    }
  }
}
