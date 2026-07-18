"use client";

import { Button, Space, Tag } from "antd";

import type { Decision, Proposal } from "@/lib/api";

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

const decisionText: Record<Decision, string> = {
  APPROVED: "已通过",
  PENDING_REVIEW: "待审核",
  REJECTED: "已驳回",
};

const decisionColor: Record<Decision, string> = {
  APPROVED: "success",
  PENDING_REVIEW: "processing",
  REJECTED: "error",
};

export function ReviewRow({
  busy,
  onDecision,
  proposal,
}: {
  readonly busy: boolean;
  readonly onDecision: (decision: Decision) => void;
  readonly proposal: Proposal;
}) {
  return (
    <Space orientation="vertical" size={8}>
      <Tag color={decisionColor[proposal.decision]}>
        {decisionText[proposal.decision]}
      </Tag>
      {!hasValidPlaceholders(proposal) && (
        <span className="field-error">占位符与中文原文不一致</span>
      )}
      <Space size={8} wrap>
        <Button
          aria-label={`审核通过 ${proposal.code}`}
          disabled={busy}
          onClick={() => onDecision("APPROVED")}
          size="small"
          type="primary"
        >
          通过
        </Button>
        <Button
          aria-label={`驳回 ${proposal.code}`}
          danger
          disabled={busy}
          onClick={() => onDecision("REJECTED")}
          size="small"
        >
          驳回
        </Button>
      </Space>
    </Space>
  );
}
