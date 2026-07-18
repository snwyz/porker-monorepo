export type Provider =
  "auto" | "codex-cli" | "anthropic" | "gemini" | "openai-compatible";

export type Decision = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export type Proposal = {
  readonly code: string;
  readonly decision: Decision;
  readonly en: string;
  readonly params: readonly number[];
  readonly sources: readonly string[];
  readonly "zh-CN": string;
};

export type DictionaryEntry = {
  readonly code: string;
  readonly en: string;
  readonly "zh-CN": string;
};

export type TranslationJob = {
  readonly approvePaidFallback?: boolean;
  readonly id: string;
  readonly codes: readonly string[];
  readonly model?: string;
  readonly provider: Provider;
  readonly proposals?: readonly Proposal[];
  readonly status: "QUEUED" | "PENDING_REVIEW" | "PUBLISHED" | "PUBLISH_FAILED";
};

export type IntakeResult = {
  readonly existing: readonly {
    readonly code: string;
    readonly "zh-CN": string;
  }[];
  readonly job?: TranslationJob;
};

export type TmsApi = {
  list(): Promise<readonly TranslationJob[]>;
  listDictionary(): Promise<readonly DictionaryEntry[]>;
  create(input: {
    approvePaidFallback?: boolean;
    entries: readonly string[];
    provider: Provider;
  }): Promise<IntakeResult>;
  run(id: string): Promise<TranslationJob>;
  updateProposal(
    id: string,
    code: string,
    update: Pick<Proposal, "decision" | "en" | "zh-CN">,
  ): Promise<TranslationJob>;
  approve(id: string): Promise<TranslationJob>;
};

const apiUrl = process.env.NEXT_PUBLIC_TMS_API_URL ?? "http://127.0.0.1:4001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw new Error(`TMS API 请求失败（${response.status}）`);
  return (await response.json()) as T;
}

export const tmsApi: TmsApi = {
  list: () => request<TranslationJob[]>("/v1/jobs"),
  listDictionary: () => request<DictionaryEntry[]>("/v1/jobs/dictionary"),
  create: (input) =>
    request<IntakeResult>("/v1/jobs", {
      body: JSON.stringify(input),
      method: "POST",
    }),
  run: (id) =>
    request<TranslationJob>(`/v1/jobs/${id}/run`, { method: "POST" }),
  updateProposal: (id, code, update) =>
    request<TranslationJob>(`/v1/jobs/${id}/proposals/${code}`, {
      body: JSON.stringify(update),
      method: "PATCH",
    }),
  approve: (id) =>
    request<TranslationJob>(`/v1/jobs/${id}/approve`, { method: "POST" }),
};
