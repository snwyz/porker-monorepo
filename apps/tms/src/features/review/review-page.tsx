"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
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
  type DictionaryEntry,
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
type SearchMode = "fuzzy" | "exact" | "code";

export function ReviewPage({ api = tmsApi }: { readonly api?: TmsApi }) {
  const [dictionary, setDictionary] = useState<readonly DictionaryEntry[]>([]);
  const [job, setJob] = useState<TranslationJob>();
  const [provider, setProvider] = useState<Provider>("auto");
  const [entries, setEntries] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [searchMode, setSearchMode] = useState<SearchMode>("fuzzy");
  const [searchText, setSearchText] = useState("");

  const loadDictionary = async () => {
    try {
      setDictionary(await api.listDictionary());
    } catch {
      setFeedback({ kind: "error", text: "加载当前词典失败。" });
    }
  };

  useEffect(() => {
    void loadDictionary();
  }, [api]);

  const proposals = job?.proposals ?? emptyProposals;
  const allApproved =
    proposals.length > 0 &&
    proposals.every(
      (proposal) =>
        proposal.decision === "APPROVED" && hasValidPlaceholders(proposal),
    );
  const filteredDictionary = useMemo(() => {
    const keyword = searchText.trim();
    if (!keyword) return dictionary;
    if (searchMode === "code") {
      return dictionary.filter(
        (entry) =>
          entry.code.toLocaleLowerCase() === keyword.toLocaleLowerCase(),
      );
    }
    const normalize = (value: string) => value.toLocaleLowerCase();
    const query = normalize(keyword);
    return dictionary.filter((entry) => {
      const values = [entry.code, entry.en, entry["zh-CN"]].map(normalize);
      return searchMode === "exact"
        ? values.some((value) => value === query)
        : values.some((value) => value.includes(query));
    });
  }, [dictionary, searchMode, searchText]);

  const replaceJob = (next: TranslationJob) => setJob(next);

  const start = async () => {
    setBusy(true);
    setFeedback(undefined);
    try {
      const intake = await api.create({
        entries: entries
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean),
        provider,
      });
      if (intake.job) {
        replaceJob(await api.run(intake.job.id));
        setFeedback({
          kind: "success",
          text: "翻译已生成，请审核后确认写入。",
        });
      } else {
        setFeedback({
          kind: "success",
          text: `全部已存在：${intake.existing.map((entry) => entry.code).join("、")}`,
        });
      }
    } catch {
      setFeedback({ kind: "error", text: "启动翻译失败，请稍后重试。" });
    } finally {
      setBusy(false);
    }
  };

  const editDraft = (code: string, field: "en" | "zh-CN", value: string) => {
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
      await loadDictionary();
      setEntries("");
      setFeedback({ kind: "success", text: "已写入权威词典。" });
    } catch {
      setFeedback({ kind: "error", text: "写入失败，请检查后重试。" });
    } finally {
      setBusy(false);
    }
  };

  const proposalColumns: TableColumnsType<Proposal> = [
    { dataIndex: "code", key: "code", title: "编号", width: 120 },
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
      title: "中文原文",
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
  const dictionaryColumns: TableColumnsType<DictionaryEntry> = [
    { dataIndex: "code", key: "code", title: "编号", width: 130 },
    { dataIndex: "zh-CN", key: "zh-CN", title: "中文" },
    { dataIndex: "en", key: "en", title: "英文" },
  ];

  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">本地语言资源</p>
        <h1>翻译管理</h1>
        <p>批量生成英文建议，审核通过后写入权威词典。</p>
      </header>

      <section aria-label="翻译控制" className="controls">
        <label className="entries-control">
          批量词条输入（每行一条）
          <Input.TextArea
            aria-label="批量词条输入"
            className="entries-textarea"
            onChange={(event) => setEntries(event.target.value)}
            placeholder="例如：\n剩余 {0} 秒\n开始游戏"
            value={entries}
          />
        </label>
        <label className="provider-control">
          翻译服务
          <Select
            aria-label="翻译服务"
            onChange={setProvider}
            options={providers.map((value) => ({ label: value, value }))}
            value={provider}
          />
        </label>
        <Button
          disabled={busy || !entries.trim()}
          loading={busy}
          onClick={() => void start()}
          type="primary"
        >
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

      {job && job.status !== "PUBLISHED" && (
        <section className="review-section">
          <div className="section-heading">
            <div>
              <h2>待审核翻译</h2>
              <p>逐条确认英文建议后，再写入词典。</p>
            </div>
          </div>
          <Table<Proposal>
            columns={proposalColumns}
            dataSource={[...proposals]}
            locale={{ emptyText: "暂无待审核条目" }}
            pagination={false}
            rowKey="code"
            scroll={{ x: 840 }}
          />
          <Space className="publish-actions">
            <Button
              disabled={busy || !allApproved}
              onClick={() => setConfirmOpen(true)}
              type="primary"
            >
              确认写入
            </Button>
          </Space>
        </section>
      )}

      <section className="dictionary-section">
        <div className="section-heading dictionary-heading">
          <div>
            <h2>当前 i18n-data 词条</h2>
            <p>权威中英文词典的完整数据。</p>
          </div>
          <Space.Compact className="dictionary-search">
            <Select
              aria-label="搜索方式"
              onChange={setSearchMode}
              options={[
                { label: "模糊搜索", value: "fuzzy" },
                { label: "精确搜索", value: "exact" },
                { label: "编号搜索", value: "code" },
              ]}
              value={searchMode}
            />
            <Input
              allowClear
              aria-label="搜索词条"
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={
                searchMode === "code"
                  ? "输入编号，如 P000001"
                  : "搜索中文、英文或编号"
              }
              value={searchText}
            />
          </Space.Compact>
        </div>
        <Table<DictionaryEntry>
          columns={dictionaryColumns}
          dataSource={[...filteredDictionary]}
          locale={{ emptyText: "未找到匹配词条" }}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
          }}
          rowKey="code"
          scroll={{ x: 720 }}
        />
      </section>

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
