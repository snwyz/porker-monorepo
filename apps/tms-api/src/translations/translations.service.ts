import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";

import type { Job, JobProposal } from "../jobs/job.schema.js";

export type I18nFiles = {
  readonly enFile: string;
  readonly zhFile: string;
};

export type TranslationEntry = Omit<JobProposal, "decision" | "en">;
export type TranslationExecutor = {
  translate(input: {
    entries: readonly TranslationEntry[];
    provider: Job["provider"];
    approvePaidFallback?: boolean;
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
    const chinese = await readDictionary(this.files.zhFile);
    this.assertKnownCodes(chinese, job.codes);
    const entries = job.codes.map((code) => {
      const source = chinese[code];
      if (source === undefined)
        throw new BadRequestException(`Unknown Chinese source code: ${code}`);
      return {
        "zh-CN": source,
        code,
        params: extractPlaceholders(source),
        sources: [this.files.zhFile],
      };
    });
    const result = await this.executor.translate({
      approvePaidFallback: job.approvePaidFallback,
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

  async validateSelectedCodes(codes: readonly string[]): Promise<void> {
    const chinese = await readDictionary(this.files.zhFile);
    this.assertKnownCodes(chinese, codes);
  }

  async allocateNextCode(): Promise<string> {
    const chinese = await readDictionary(this.files.zhFile);
    const numbers = Object.keys(chinese).map((code) => {
      if (!/^P\d{6}$/.test(code) || code === "P000000") {
        throw new BadRequestException(`Invalid message code: ${code}`);
      }
      return Number(code.slice(1));
    });
    const next = Math.max(0, ...numbers) + 1;
    if (next > 999_999) throw new Error("message code range is exhausted");
    return `P${String(next).padStart(6, "0")}`;
  }

  private assertKnownCodes(
    chinese: Record<string, string>,
    codes: readonly string[],
  ): void {
    const unknown = codes.find((code) => chinese[code] === undefined);
    if (unknown)
      throw new BadRequestException(`Unknown Chinese source code: ${unknown}`);
  }
}

export function extractPlaceholders(template: string): number[] {
  return [
    ...new Set(
      [...template.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1])),
    ),
  ].sort((left, right) => left - right);
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

export async function readDictionary(
  file: string,
): Promise<Record<string, string>> {
  const value = await readJson<unknown>(file);
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.values(value).some((entry) => typeof entry !== "string")
  ) {
    throw new BadRequestException(`Invalid locale dictionary: ${file}`);
  }
  return value as Record<string, string>;
}
