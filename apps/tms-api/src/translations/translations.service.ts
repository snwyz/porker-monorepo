import { Inject, Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";

import type { Job, JobProposal } from "../jobs/job.schema.js";

export type I18nFiles = {
  readonly catalogFile: string;
  readonly enFile: string;
  readonly zhFile: string;
};

export type TranslationEntry = Omit<JobProposal, "decision" | "zh-CN">;
export type TranslationExecutor = {
  translate(input: {
    entries: readonly TranslationEntry[];
    provider: Job["provider"];
  }): Promise<{
    model: string;
    proposals: readonly Omit<JobProposal, "decision">[];
    provider: Exclude<Job["provider"], "auto">;
  }>;
};

@Injectable()
export class TranslationsService {
  constructor(
    @Inject("TMS_I18N_FILES") private readonly files: I18nFiles,
    @Inject("TMS_TRANSLATION_EXECUTOR")
    private readonly executor: TranslationExecutor,
  ) {}

  async run(job: Job): Promise<Job> {
    const [catalog, english] = await Promise.all([
      readJson<Record<string, number[]>>(this.files.catalogFile),
      readJson<Record<string, string>>(this.files.enFile),
    ]);
    const entries = job.codes.map((code) => {
      const params = catalog[code];
      const en = english[code];
      if (params === undefined || en === undefined) {
        throw new Error(`Unknown catalog code: ${code}`);
      }
      return { code, en, params, sources: [] };
    });
    const result = await this.executor.translate({
      entries,
      provider: job.provider,
    });
    if (
      result.proposals.length !== entries.length ||
      result.proposals.some(
        (proposal, index) => proposal.code !== entries[index]?.code,
      )
    ) {
      throw new Error("proposal code mismatch");
    }
    return {
      ...job,
      model: result.model,
      proposals: result.proposals.map((proposal) => ({
        ...proposal,
        decision: "PENDING_REVIEW" as const,
      })),
      status: "PENDING_REVIEW",
    };
  }
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}
