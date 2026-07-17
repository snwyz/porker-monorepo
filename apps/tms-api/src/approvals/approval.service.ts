import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import type { Job, JobProposal } from "../jobs/job.schema.js";
import { type SnapshotRepository } from "../publication/snapshot.repository.js";
import type { I18nFiles } from "../translations/translations.service.js";
import { readJson } from "../translations/translations.service.js";

@Injectable()
export class ApprovalService {
  constructor(
    @Inject("TMS_I18N_FILES") private readonly files: I18nFiles,
    @Inject("TMS_SNAPSHOT_REPOSITORY")
    private readonly snapshots: SnapshotRepository,
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

    const previous = await this.snapshots.read();
    const [catalog, english, zh] = previous
      ? [previous.catalog, previous.en, previous["zh-CN"]]
      : await Promise.all([
          readJson<Record<string, number[]>>(this.files.catalogFile),
          readJson<Record<string, string>>(this.files.enFile),
          readJson<Record<string, string>>(this.files.zhFile),
        ]);
    const nextZh = { ...zh };
    for (const proposal of job.proposals)
      nextZh[proposal.code] = proposal["zh-CN"];
    validateDictionaries(catalog, english, nextZh);
    await this.snapshots.publish({
      version: (previous?.version ?? 0) + 1,
      catalog,
      en: english,
      "zh-CN": nextZh,
    });
    return { ...job, status: "PUBLISHED" };
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
