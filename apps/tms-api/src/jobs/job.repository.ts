import {
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { randomUUID } from "node:crypto";

import { JobSchema, type Job } from "./job.schema.js";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../../../", import.meta.url)),
);

export async function readTmsDataDirectory(
  value: string | undefined = process.env.TMS_DATA_DIR,
): Promise<string> {
  if (!value) {
    throw new Error("TMS_DATA_DIR is required");
  }
  if (!isAbsolute(value)) {
    throw new Error("TMS_DATA_DIR must be an absolute path");
  }

  const [dataDirectory, realRepositoryRoot] = await Promise.all([
    resolveRealPath(value),
    realpath(repositoryRoot),
  ]);
  const fromRepository = relative(realRepositoryRoot, dataDirectory);
  const isInsideRepository =
    fromRepository === "" ||
    (!fromRepository.startsWith(`..${sep}`) &&
      fromRepository !== ".." &&
      !isAbsolute(fromRepository));
  if (isInsideRepository) {
    throw new Error("TMS_DATA_DIR must be outside the repository");
  }
  return dataDirectory;
}

async function resolveRealPath(value: string): Promise<string> {
  const missingSegments: string[] = [];
  let candidate = resolve(value);

  for (;;) {
    try {
      const existingDirectory = await realpath(candidate);
      return missingSegments.reduce(
        (directory, segment) => join(directory, segment),
        existingDirectory,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(candidate);
      if (parent === candidate) {
        throw error;
      }
      missingSegments.unshift(basename(candidate));
      candidate = parent;
    }
  }
}

export class JobRepository {
  private readonly jobsDirectory: string;

  constructor(dataDirectory: string) {
    this.jobsDirectory = join(dataDirectory, "jobs");
  }

  async initialize(): Promise<void> {
    await mkdir(this.jobsDirectory, { recursive: true });
  }

  async save(job: Job): Promise<Job> {
    const file = this.fileFor(job.id);
    const temporaryFile = join(
      this.jobsDirectory,
      `.${basename(file)}.${randomUUID()}.tmp`,
    );
    const contents = `${JSON.stringify(job, null, 2)}\n`;

    await writeFile(temporaryFile, contents, "utf8");
    await rename(temporaryFile, file);
    return job;
  }

  async find(id: string): Promise<Job | undefined> {
    try {
      const contents = await readFile(this.fileFor(id), "utf8");
      return JobSchema.parse(JSON.parse(contents));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async list(): Promise<Job[]> {
    const entries = await readdir(this.jobsDirectory, { withFileTypes: true });
    const jobs = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const contents = await readFile(
            join(this.jobsDirectory, entry.name),
            "utf8",
          );
          return JobSchema.parse(JSON.parse(contents));
        }),
    );
    return jobs.sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  private fileFor(id: string): string {
    return join(this.jobsDirectory, `${id}.json`);
  }
}
