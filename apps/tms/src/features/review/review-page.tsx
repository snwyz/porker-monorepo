"use client";

import { useEffect, useMemo, useState } from "react";

import {
  tmsApi,
  type Proposal,
  type Provider,
  type TmsApi,
  type TranslationJob,
} from "@/lib/api";
import { hasValidPlaceholders, ReviewRow } from "./review-row";

export type { TmsApi, TranslationJob } from "@/lib/api";

type Filter = "all" | "pending" | "approved" | "rejected" | "validation";

const providers: readonly Provider[] = [
  "auto",
  "codex-cli",
  "anthropic",
  "gemini",
  "openai-compatible",
];
const emptyProposals: readonly Proposal[] = [];

export function ReviewPage({ api = tmsApi }: { readonly api?: TmsApi }) {
  const [jobs, setJobs] = useState<readonly TranslationJob[]>([]);
  const [job, setJob] = useState<TranslationJob | undefined>();
  const [provider, setProvider] = useState<Provider>("auto");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void api
      .list()
      .then(setJobs)
      .catch(() => setError("Could not load jobs."));
  }, [api]);

  const proposals = job?.proposals ?? emptyProposals;
  const visible = useMemo(
    () => proposals.filter((proposal) => matchesFilter(proposal, filter)),
    [filter, proposals],
  );
  const allApproved =
    proposals.length > 0 &&
    proposals.every((proposal) => proposal.decision === "APPROVED");

  const replaceJob = (next: TranslationJob) => {
    setJob(next);
    setJobs((current) => [
      next,
      ...current.filter((candidate) => candidate.id !== next.id),
    ]);
  };

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const created = await api.create({ codes: ["P00042"], provider });
      replaceJob(await api.run(created.id));
    } catch {
      setError("Could not start translation.");
    } finally {
      setBusy(false);
    }
  };

  const updateProposal = async (
    proposal: Proposal,
    update: Pick<Proposal, "decision" | "zh-CN">,
  ) => {
    if (!job) return;
    setBusy(true);
    setError(undefined);
    try {
      replaceJob(await api.updateProposal(job.id, proposal.code, update));
    } catch {
      setError(`Could not update ${proposal.code}.`);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!job || !allApproved) return;
    setBusy(true);
    setError(undefined);
    try {
      replaceJob(await api.approve(job.id));
    } catch {
      setError("Could not publish this review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">Internal translation management</p>
        <h1>Review translations</h1>
        <p>
          Paid providers require a confirmation in the API. This interface never
          stores credentials.
        </p>
      </header>
      <section className="controls" aria-label="Translation controls">
        <label>
          Job
          <select
            aria-label="Job"
            onChange={(event) =>
              setJob(
                jobs.find((candidate) => candidate.id === event.target.value),
              )
            }
            value={job?.id ?? ""}
          >
            <option value="">New review</option>
            {jobs.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Provider
          <select
            aria-label="Provider"
            onChange={(event) => setProvider(event.target.value as Provider)}
            value={provider}
          >
            {providers.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={start} type="button">
          Start translation
        </button>
        <label>
          Filter
          <select
            aria-label="Filter"
            onChange={(event) => setFilter(event.target.value as Filter)}
            value={filter}
          >
            <option value="all">All entries</option>
            <option value="pending">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="validation">Validation issues</option>
          </select>
        </label>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {job && (
        <p className="job-meta">
          Job {job.id} · {job.provider} · {job.model ?? "Model pending"} ·{" "}
          {job.status}
        </p>
      )}
      <section className="review-list" aria-label="Translation entries">
        {visible.map((proposal) => (
          <ReviewRow
            key={proposal.code}
            model={job?.model}
            onChange={(update) => void updateProposal(proposal, update)}
            proposal={proposal}
            provider={job?.provider ?? provider}
          />
        ))}
      </section>
      <button disabled={busy || !allApproved} onClick={approve} type="button">
        Publish {proposals.length} approved entries
      </button>
    </main>
  );
}

function matchesFilter(proposal: Proposal, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "validation") return !hasValidPlaceholders(proposal);
  return proposal.decision.toLowerCase() === filter;
}
