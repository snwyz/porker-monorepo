import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { CreateEntries, Job, JobProposal } from "../jobs/job.schema.js";
import { JobRepository } from "../jobs/job.repository.js";

export type I18nFiles = {
  readonly enFile: string;
  readonly zhFile: string;
};

export type TranslationEntry = Omit<JobProposal, "decision" | "en">;
export type DictionaryEntry = {
  readonly code: string;
  readonly en: string;
  readonly "zh-CN": string;
};
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
  private allocationQueue: Promise<void> = Promise.resolve();
  constructor(
    @Inject("TMS_I18N_FILES") private readonly files: I18nFiles,
    @Inject("TMS_TRANSLATION_EXECUTOR")
    private readonly executor: TranslationExecutor,
    private readonly jobs: JobRepository,
  ) {}

  async createBatch(input: CreateEntries): Promise<{
    readonly existing: readonly {
      readonly code: string;
      readonly "zh-CN": string;
    }[];
    readonly job?: Job;
  }> {
    let release!: () => void;
    const previous = this.allocationQueue;
    this.allocationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const [english, chinese, jobs] = await Promise.all([
        readDictionary(this.files.enFile),
        readDictionary(this.files.zhFile),
        this.jobs.list(),
      ]);
      const known = new Map(
        Object.entries(chinese).map(([code, value]) => [
          normalizeChinese(value),
          code,
        ]),
      );
      const existing: { code: string; "zh-CN": string }[] = [];
      const additions = new Map<string, string>();
      for (const value of input.entries) {
        const normalized = normalizeChinese(value);
        const code = known.get(normalized);
        if (code) existing.push({ code, "zh-CN": chinese[code]! });
        else additions.set(normalized, value.trim());
      }
      if (additions.size === 0) return { existing };
      const occupied = new Set([
        ...Object.keys(english),
        ...Object.keys(chinese),
        ...jobs
          .filter((job) => !["PUBLISHED"].includes(job.status))
          .flatMap((job) => job.codes),
      ]);
      let next = 1;
      const sources: Record<string, string> = {};
      for (const value of additions.values()) {
        while (occupied.has(formatCode(next))) next += 1;
        if (next > 999_999) throw new Error("message code range is exhausted");
        const code = formatCode(next++);
        occupied.add(code);
        sources[code] = value;
      }
      const job: Job = {
        approvePaidFallback: input.approvePaidFallback,
        codes: Object.keys(sources),
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        provider: input.provider,
        sources,
        status: "QUEUED",
      };
      await this.jobs.save(job);
      return { existing, job };
    } finally {
      release();
    }
  }

  async listDictionary(): Promise<readonly DictionaryEntry[]> {
    const [english, chinese] = await Promise.all([
      readDictionary(this.files.enFile),
      readDictionary(this.files.zhFile),
    ]);
    const codes = new Set([...Object.keys(english), ...Object.keys(chinese)]);
    const inconsistent = [...codes].find(
      (code) => english[code] === undefined || chinese[code] === undefined,
    );
    if (inconsistent) {
      throw new BadRequestException(
        `Inconsistent locale dictionary: ${inconsistent}`,
      );
    }
    return [...codes]
      .sort((left, right) => left.localeCompare(right))
      .map((code) => ({
        code,
        en: english[code]!,
        "zh-CN": chinese[code]!,
      }));
  }

  async run(job: Job): Promise<Job> {
    const chinese = await readDictionary(this.files.zhFile);
    const entries = job.codes.map((code) => {
      const source = job.sources?.[code] ?? chinese[code];
      if (source === undefined)
        throw new BadRequestException(
          `Missing reserved Chinese source: ${code}`,
        );
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

function normalizeChinese(value: string): string {
  return value.trim().normalize("NFC").replace(/\s+/g, " ");
}

function formatCode(value: number): string {
  return `P${String(value).padStart(6, "0")}`;
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
