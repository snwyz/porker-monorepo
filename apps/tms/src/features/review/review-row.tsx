"use client";

import type { Proposal, Provider } from "@/lib/api";

export function hasValidPlaceholders(proposal: Proposal): boolean {
  const expected = [...proposal.params].sort().join(",");
  const tokens = (value: string) =>
    [...new Set([...value.matchAll(/\{(\d+)\}/g)].map((match) => match[1]))]
      .sort()
      .join(",");
  return (
    tokens(proposal.en) === expected && tokens(proposal["zh-CN"]) === expected
  );
}

export function ReviewRow({
  proposal,
  provider,
  model,
  onChange,
}: {
  readonly proposal: Proposal;
  readonly provider: Provider;
  readonly model?: string;
  readonly onChange: (update: Pick<Proposal, "decision" | "zh-CN">) => void;
}) {
  const placeholders = proposal.params.map((param) => `{${param}}`).join(", ");
  return (
    <article className="review-row">
      <header>
        <strong>{proposal.code}</strong>
        <span className={`decision ${proposal.decision.toLowerCase()}`}>
          {proposal.decision}
        </span>
      </header>
      <dl>
        <div>
          <dt>English</dt>
          <dd>{proposal.en}</dd>
        </div>
        <div>
          <dt>Placeholders</dt>
          <dd>{placeholders || "None"}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{proposal.sources.join(", ") || "No source metadata"}</dd>
        </div>
        <div>
          <dt>Provider / model</dt>
          <dd>
            {provider} / {model ?? "Pending"}
          </dd>
        </div>
      </dl>
      <label htmlFor={`chinese-${proposal.code}`}>
        Chinese for {proposal.code}
        <input
          id={`chinese-${proposal.code}`}
          onChange={(event) =>
            onChange({
              decision: proposal.decision,
              "zh-CN": event.target.value,
            })
          }
          value={proposal["zh-CN"]}
        />
      </label>
      {!hasValidPlaceholders(proposal) && (
        <p className="error">Placeholder validation failed.</p>
      )}
      <div className="actions" aria-label={`Decision for ${proposal.code}`}>
        <button
          onClick={() =>
            onChange({ decision: "APPROVED", "zh-CN": proposal["zh-CN"] })
          }
          type="button"
        >
          Approve {proposal.code}
        </button>
        <button
          onClick={() =>
            onChange({ decision: "REJECTED", "zh-CN": proposal["zh-CN"] })
          }
          type="button"
        >
          Reject {proposal.code}
        </button>
      </div>
    </article>
  );
}
