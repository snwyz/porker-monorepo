"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Space,
  Table,
  type TableColumnsType,
} from "antd";

import {
  tmsApi,
  type Decision,
  type Proposal,
  type Provider,
  type TmsApi,
  type TranslationJob,
} from "@/lib/api";
import { hasValidPlaceholders, ReviewRow } from "./review-row";

export type { TmsApi, TranslationJob } from "@/lib/api";

const providers: readonly Provider[] = [
  "auto",
  "codex-cli",
  "anthropic",
  "gemini",
  "openai-compatible",
];
const emptyProposals: readonly Proposal[] = [];

type Feedback = { readonly kind: "error" | "success"; readonly text: string };

export function ReviewPage({ api = tmsApi }: { readonly api?: TmsApi }) {
  const [jobs, setJobs] = useState<readonly TranslationJob[]>([]);
  const [job, setJob] = useState<TranslationJob>();
  const [provider, setProvider] = useState<Provider>("auto");
  const [approvePaidFallback, setApprovePaidFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();

  useEffect(() => {
    void api
      .list()
      .then(setJobs)
      .catch(() => setFeedback({ kind: "error", text: "加载审核任务失败。" }));
  }, [api]);

  const proposals = job?.proposals ?? emptyProposals;
  const allApproved =
    proposals.length > 0 &&
    proposals.every(
      (proposal) =>
        proposal.decision === "APPROVED" && hasValidPlaceholders(proposal),
    );

  const replaceJob = (next: TranslationJob) => {
    setJob(next);
    setJobs((current) => [
      next,
      ...current.filter((candidate) => candidate.id !== next.id),
    ]);
  };

  const start = async () => {
    setBusy(true);
    setFeedback(undefined);
    try {
      const created = await api.create({
        approvePaidFallback,
        codes: ["P000042"],
        provider,
      });
      replaceJob(await api.run(created.id));
    } catch {
      setFeedback({ kind: "error", text: "启动翻译失败，请稍后重试。" });
    } finally {
      setBusy(false);
    }
  };

  const editDraft = (
    code: string,
    field: "en" | "zh-CN",
    value: string,
  ) => {
    setJob((current) =>
      current?.proposals
        ? {
            ...current,
            proposals: current.proposals.map((proposal) =>
              proposal.code === code
                ? { ...proposal, [field]: value, decision: "PENDING_REVIEW" }
                : proposal,
            ),
          }
        : current,
    );
    setFeedback(undefined);
  };

  const decide = async (proposal: Proposal, decision: Decision) => {
    if (!job) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      replaceJob(
        await api.updateProposal(job.id, proposal.code, {
          "zh-CN": proposal["zh-CN"],
          decision,
          en: proposal.en,
        }),
      );
    } catch {
      setFeedback({
        kind: "error",
        text: `更新 ${proposal.code} 的审核状态失败。`,
      });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!job || !allApproved) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      replaceJob(await api.approve(job.id));
      setConfirmOpen(false);
      setFeedback({ kind: "success", text: "写入成功。" });
    } catch {
      setFeedback({ kind: "error", text: "写入失败，请检查后重试。" });
    } finally {
      setBusy(false);
    }
  };

  const columns: TableColumnsType<Proposal> = [
      {
        dataIndex: "code",
        key: "code",
        title: "编号",
        width: 120,
      },
      {
        key: "en",
        render: (_, proposal) => (
          <Input
            aria-label={`英文原文 ${proposal.code}`}
            disabled={busy || job?.status === "PUBLISHED"}
            onChange={(event) =>
              editDraft(proposal.code, "en", event.target.value)
            }
            value={proposal.en}
          />
        ),
        title: "英文原文",
      },
      {
        key: "zh-CN",
        render: (_, proposal) => (
          <Input
            aria-label={`中文译文 ${proposal.code}`}
            disabled={busy || job?.status === "PUBLISHED"}
            onChange={(event) =>
              editDraft(proposal.code, "zh-CN", event.target.value)
            }
            value={proposal["zh-CN"]}
          />
        ),
        title: "中文译文",
      },
      {
        key: "decision",
        render: (_, proposal) => (
          <ReviewRow
            busy={busy || job?.status === "PUBLISHED"}
            onDecision={(decision) => void decide(proposal, decision)}
            proposal={proposal}
          />
        ),
        title: "审核状态",
        width: 180,
      },
    ];

  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">内部翻译管理</p>
        <h1>中文源翻译审核</h1>
        <p>审核英文建议与中文原文，确认后写入正式语言文件。</p>
      </header>

      <section aria-label="翻译控制" className="controls">
        <label>
          审核任务
          <Select
            aria-label="审核任务"
            onChange={(id: string) =>
              setJob(jobs.find((candidate) => candidate.id === id))
            }
            options={jobs.map((candidate) => ({
              label: candidate.id,
              value: candidate.id,
            }))}
            placeholder="新建审核"
            value={job?.id}
          />
        </label>
        <label>
          翻译服务
          <Select
            aria-label="翻译服务"
            onChange={setProvider}
            options={providers.map((value) => ({ label: value, value }))}
            value={provider}
          />
        </label>
        <Checkbox
          checked={approvePaidFallback}
          onChange={(event) => setApprovePaidFallback(event.target.checked)}
        >
          允许付费服务兜底
        </Checkbox>
        <Button disabled={busy} loading={busy} onClick={() => void start()}>
          开始翻译
        </Button>
      </section>

      {feedback && (
        <p
          className={feedback.kind === "error" ? "error" : "success"}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      )}

      {job && (
        <p className="job-meta">
          任务 {job.id} · {job.provider} · {job.model ?? "模型待定"} ·{" "}
          {job.status}
        </p>
      )}

      <Table<Proposal>
        columns={columns}
        dataSource={[...proposals]}
        locale={{ emptyText: "暂无待审核条目" }}
        pagination={false}
        rowKey="code"
        scroll={{ x: 840 }}
      />

      <Space className="publish-actions">
        <Button
          disabled={busy || !allApproved || job?.status === "PUBLISHED"}
          onClick={() => setConfirmOpen(true)}
          type="primary"
        >
          确认写入
        </Button>
      </Space>

      <Modal
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => setConfirmOpen(false)}
        onOk={() => void approve()}
        okText="确认写入"
        open={confirmOpen}
        title="确认写入翻译？"
      >
        <p>通过审核的内容将写入正式语言文件。</p>
      </Modal>
    </main>
  );
}
