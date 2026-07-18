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
    const allowed = join(realRepositoryRoot, "i18n-data", "web");
    if (dataDirectory !== allowed) {
      throw new Error("TMS_DATA_DIR must be outside the repository or equal i18n-data/web");
    }
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
  private readonly jobsFile: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDirectory: string) {
    this.jobsFile = join(dataDirectory, "pending-jobs.json");
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.jobsFile), { recursive: true });
    try { await readFile(this.jobsFile, "utf8"); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.write([]);
    }
  }

  async save(job: Job): Promise<Job> {
    const update = this.writeQueue.then(async () => {
      const jobs = await this.list();
      const index = jobs.findIndex((candidate) => candidate.id === job.id);
      if (index >= 0) jobs[index] = job;
      else jobs.push(job);
      await this.write(jobs);
    });
    this.writeQueue = update.catch(() => undefined);
    await update;
    return job;
  }

  async find(id: string): Promise<Job | undefined> {
    try {
      return (await this.list()).find((job) => job.id === id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async list(): Promise<Job[]> {
    const contents = await readFile(this.jobsFile, "utf8");
    return JobSchema.array().parse(JSON.parse(contents)).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  private async write(jobs: readonly Job[]): Promise<void> {
    const temporaryFile = `${this.jobsFile}.${randomUUID()}.tmp`;
    await writeFile(temporaryFile, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
    await rename(temporaryFile, this.jobsFile);
  }
}
