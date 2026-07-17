/* eslint-disable no-unused-vars -- Core ESLint cannot see TypeScript type references. */
import { randomUUID } from "node:crypto";

import type { ProviderId } from "../../provider.js";
import {
  TranslationEntrySchema,
  TranslationProposalSchema,
  TranslationProposalsSchema,
  type TranslationEntry,
  type TranslationJob,
  type TranslationProposal,
} from "./schema.js";

export function parseTranslationEntries(input: string): TranslationEntry[] {
  return validateInputEntries(JSON.parse(input) as unknown);
}

export function validateProposal(input: unknown): TranslationProposal {
  const proposal = TranslationProposalSchema.parse(input);
  assertPlaceholderSet(proposal.en, proposal.params);
  assertPlaceholderSet(proposal["zh-CN"], proposal.params);
  return proposal;
}

export function validateProposals(
  entries: readonly TranslationEntry[],
  input: unknown,
): TranslationProposal[] {
  const validatedEntries = validateInputEntries(entries);
  const proposals = TranslationProposalsSchema.parse(input);

  if (proposals.length !== validatedEntries.length) {
    throw new Error("proposal code mismatch");
  }

  return proposals.map((proposal, index) => {
    const entry = validatedEntries[index];
    if (entry === undefined || proposal.code !== entry.code) {
      throw new Error("proposal code mismatch");
    }
    if (!matchesEntry(entry, proposal)) {
      throw new Error("proposal entry mismatch");
    }
    return validateProposal(proposal);
  });
}

export type CreateTranslationJobOptions = {
  readonly entries: readonly TranslationEntry[];
  readonly proposals: unknown;
  readonly provider: ProviderId;
  readonly model: string;
  readonly createId?: () => string;
};

export function createTranslationJob(
  options: CreateTranslationJobOptions,
): TranslationJob {
  const proposals = validateProposals(options.entries, options.proposals);
  const createId = options.createId ?? randomUUID;

  return {
    id: createId(),
    status: "PENDING_REVIEW",
    proposals,
    provider: options.provider,
    model: options.model,
  };
}

function validateInputEntries(input: unknown): TranslationEntry[] {
  const entries = TranslationEntrySchema.array().parse(input);
  const seenCodes = new Set<string>();
  for (const entry of entries) {
    if (seenCodes.has(entry.code)) {
      throw new Error("duplicate input code");
    }
    seenCodes.add(entry.code);
    assertPlaceholderSet(entry.en, entry.params);
  }
  return entries;
}

function matchesEntry(
  entry: TranslationEntry,
  proposal: TranslationProposal,
): boolean {
  return (
    entry.en === proposal.en &&
    arraysMatch(entry.params, proposal.params) &&
    arraysMatch(entry.sources, proposal.sources)
  );
}

function assertPlaceholderSet(
  template: string,
  params: readonly number[],
): void {
  if (!numberSetsMatch(extractPlaceholders(template), params)) {
    throw new Error("placeholder mismatch");
  }
}

function extractPlaceholders(template: string): number[] {
  return [...template.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1]));
}

function numberSetsMatch(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return arraysMatch(
    [...new Set(left)].sort(compareNumbers),
    [...new Set(right)].sort(compareNumbers),
  );
}

function arraysMatch<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}
