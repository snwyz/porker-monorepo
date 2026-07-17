import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import type { Job, JobProposal } from "../jobs/job.schema.js";
import type { I18nFiles } from "../translations/translations.service.js";
import { readJson } from "../translations/translations.service.js";

export type Publisher = {
  publish(input: {
    catalog: unknown;
    catalogFile: string;
    zh: unknown;
    zhFile: string;
  }): Promise<void>;
};

export type ReplaceFile = (
  source: string,
  destination: string,
) => Promise<void>;

@Injectable()
export class ApprovalService {
  constructor(
    @Inject("TMS_I18N_FILES") private readonly files: I18nFiles,
    @Inject("TMS_PUBLISHER") private readonly publisher: Publisher,
  ) {}

  edit(
    job: Job,
    code: string,
    update: Pick<JobProposal, "decision" | "zh-CN">,
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
    if (job.proposals.some((proposal) => proposal.decision !== "APPROVED")) {
      throw new BadRequestException("Every proposal must be approved");
    }
    for (const proposal of job.proposals) {
      if (!samePlaceholders(proposal.en, proposal["zh-CN"])) {
        throw new BadRequestException(
          `Placeholder mismatch for ${proposal.code}`,
        );
      }
    }

    const [catalog, english, zh] = await Promise.all([
      readJson<Record<string, number[]>>(this.files.catalogFile),
      readJson<Record<string, string>>(this.files.enFile),
      readJson<Record<string, string>>(this.files.zhFile),
    ]);
    const nextZh = { ...zh };
    for (const proposal of job.proposals)
      nextZh[proposal.code] = proposal["zh-CN"];
    validateDictionaries(catalog, english, nextZh);
    await this.publisher.publish({
      catalog,
      catalogFile: this.files.catalogFile,
      zh: nextZh,
      zhFile: this.files.zhFile,
    });
    return { ...job, status: "PUBLISHED" };
  }
}

export function createAtomicPublisher(
  replace: ReplaceFile = rename,
): Publisher {
  return {
    async publish({ catalog, catalogFile, zh, zhFile }): Promise<void> {
      const [originalCatalog, originalZh] = await Promise.all([
        readFile(catalogFile, "utf8"),
        readFile(zhFile, "utf8"),
      ]);
      try {
        await atomicWrite(catalogFile, catalog, replace);
        await atomicWrite(zhFile, zh, replace);
      } catch (error) {
        await Promise.allSettled([
          atomicWriteContent(catalogFile, originalCatalog, replace),
          atomicWriteContent(zhFile, originalZh, replace),
        ]);
        throw error;
      }
    },
  };
}

export const atomicPublisher = createAtomicPublisher();

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

function samePlaceholders(left: string, right: string): boolean {
  const tokens = (value: string) =>
    [
      ...new Set([...value.matchAll(/\{(\d+)\}/g)].map((match) => match[1])),
    ].sort();
  return JSON.stringify(tokens(left)) === JSON.stringify(tokens(right));
}

function validateDictionaries(
  catalog: Record<string, number[]>,
  english: Record<string, string>,
  zh: Record<string, string>,
): void {
  for (const [code, params] of Object.entries(catalog)) {
    if (english[code] === undefined || zh[code] === undefined) {
      throw new BadRequestException(`Missing dictionary entry for ${code}`);
    }
    const expected = params.map(String).sort().join(",");
    for (const template of [english[code], zh[code]]) {
      const actual = [
        ...new Set([...template.matchAll(/\{(\d+)\}/g)].map((m) => m[1])),
      ]
        .sort()
        .join(",");
      if (actual !== expected)
        throw new BadRequestException(`Placeholder mismatch for ${code}`);
    }
  }
}
