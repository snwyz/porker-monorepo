import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { open, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { Job, JobProposal } from "../jobs/job.schema.js";
import {
  extractPlaceholders,
  type I18nFiles,
  readDictionary,
} from "../translations/translations.service.js";

export type ReplaceLocaleFile = (
  source: string,
  destination: string,
) => Promise<void>;

@Injectable()
export class ApprovalService {
  private localeUpdateQueue: Promise<void> = Promise.resolve();

  constructor(
    @Inject("TMS_I18N_FILES") private readonly files: I18nFiles,
    @Inject("TMS_REPLACE_LOCALE_FILE")
    private readonly replaceLocaleFile: ReplaceLocaleFile,
  ) {}

  edit(
    job: Job,
    code: string,
    update: Pick<JobProposal, "decision" | "en" | "zh-CN">,
  ): Job {
    if (job.status !== "PENDING_REVIEW" || job.proposals === undefined) {
      throw new BadRequestException("Translation job is not ready for review");
    }
    const found = job.proposals.some((proposal) => proposal.code === code);
    if (!found)
      throw new BadRequestException("Translation proposal was not found");
    return {
      ...job,
      proposals: job.proposals.map((proposal) =>
        proposal.code === code ? { ...proposal, ...update } : proposal,
      ),
    };
  }

  async approve(job: Job): Promise<Job> {
    if (job.status !== "PENDING_REVIEW" || job.proposals === undefined) {
      throw new BadRequestException(
        "Translation job is not ready for approval",
      );
    }
    const approved = job.proposals.filter(
      (proposal) => proposal.decision === "APPROVED",
    );
    if (approved.length === 0) {
      throw new BadRequestException("At least one proposal must be approved");
    }
    for (const proposal of approved) {
      if (!samePlaceholders(proposal.en, proposal["zh-CN"])) {
        throw new BadRequestException(
          `Placeholder mismatch for ${proposal.code}`,
        );
      }
    }

    return this.queueLocaleUpdate(async () => {
      const [english, zh] = await Promise.all([
        readDictionary(this.files.enFile),
        readDictionary(this.files.zhFile),
      ]);
      const nextEnglish = { ...english };
      const nextZh = { ...zh };
      for (const proposal of approved) {
        nextEnglish[proposal.code] = proposal.en;
        nextZh[proposal.code] = proposal["zh-CN"];
      }
      validateDictionaries(nextEnglish, nextZh);
      await replaceLocalePair(
        this.files,
        nextEnglish,
        nextZh,
        this.replaceLocaleFile,
      );
      return { ...job, status: "PUBLISHED" };
    });
  }

  private queueLocaleUpdate<T>(update: () => Promise<T>): Promise<T> {
    const queued = this.localeUpdateQueue.then(update);
    this.localeUpdateQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }
}

function samePlaceholders(left: string, right: string): boolean {
  const tokens = (value: string) =>
    [
      ...new Set([...value.matchAll(/\{(\d+)\}/g)].map((match) => match[1])),
    ].sort();
  return JSON.stringify(tokens(left)) === JSON.stringify(tokens(right));
}

export function validateDictionaries(
  english: Record<string, string>,
  zh: Record<string, string>,
): void {
  const codes = new Set([...Object.keys(english), ...Object.keys(zh)]);
  for (const code of codes) {
    if (!/^P\d{6}$/.test(code) || code === "P000000") {
      throw new BadRequestException(`Invalid message code: ${code}`);
    }
    if (english[code] === undefined || zh[code] === undefined) {
      throw new BadRequestException(`Missing dictionary entry for ${code}`);
    }
    if (!samePlaceholders(english[code], zh[code])) {
      throw new BadRequestException(`Placeholder mismatch for ${code}`);
    }
  }
}

async function replaceLocalePair(
  files: I18nFiles,
  english: Record<string, string>,
  zh: Record<string, string>,
  replace: ReplaceLocaleFile,
): Promise<void> {
  const originalEnglish = await open(files.enFile, "r").then(async (file) => {
    try {
      return await file.readFile("utf8");
    } finally {
      await file.close();
    }
  });
  const temporaryEnglish = temporaryPath(files.enFile, "next");
  const temporaryZh = temporaryPath(files.zhFile, "next");
  const rollbackEnglish = temporaryPath(files.enFile, "rollback");
  const temporaryFiles = [temporaryEnglish, temporaryZh, rollbackEnglish];

  try {
    await Promise.all([
      writeSynced(temporaryEnglish, serialize(english)),
      writeSynced(temporaryZh, serialize(zh)),
      writeSynced(rollbackEnglish, originalEnglish),
    ]);
    await replace(temporaryEnglish, files.enFile);
    try {
      await replace(temporaryZh, files.zhFile);
    } catch (publishError) {
      try {
        await replace(rollbackEnglish, files.enFile);
        await syncDirectories([dirname(files.enFile)]);
      } catch (rollbackError) {
        throw new AggregateError(
          [publishError, rollbackError],
          "Locale replacement and rollback failed",
          { cause: rollbackError },
        );
      }
      throw new Error("Locale replacement failed; first locale restored", {
        cause: publishError,
      });
    }
    await syncDirectories([dirname(files.enFile), dirname(files.zhFile)]);
  } finally {
    await Promise.all(temporaryFiles.map((file) => rm(file, { force: true })));
  }
}

async function writeSynced(path: string, contents: string): Promise<void> {
  const file = await open(path, "wx");
  try {
    await file.writeFile(contents, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
}

async function syncDirectories(directories: readonly string[]): Promise<void> {
  for (const directory of new Set(directories)) {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

function serialize(dictionary: Record<string, string>): string {
  return `${JSON.stringify(dictionary, null, 2)}\n`;
}

function temporaryPath(target: string, purpose: string): string {
  return join(
    dirname(target),
    `.${basename(target)}.${purpose}.${randomUUID()}.tmp`,
  );
}
