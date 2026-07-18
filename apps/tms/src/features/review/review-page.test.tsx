import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReviewPage, type TmsApi, type TranslationJob } from "./review-page";

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

const pendingJob: TranslationJob = {
  id: "job-1",
  codes: ["P000042"],
  model: "fake-model",
  provider: "codex-cli",
  proposals: [
    {
      code: "P000042",
      decision: "PENDING_REVIEW",
      en: "{0} seconds remaining",
      params: [0],
      sources: ["i18n-data/web/zh-CN.json"],
      "zh-CN": "剩余 {0} 秒",
    },
  ],
  status: "PENDING_REVIEW",
};

const dictionary = [
  { code: "P000001", en: "Start game", "zh-CN": "开始游戏" },
  { code: "P000042", en: "Seconds remaining", "zh-CN": "剩余秒数" },
];

function fakeApi(overrides: Partial<TmsApi> = {}): TmsApi {
  return {
    approve: async () => ({ ...pendingJob, status: "PUBLISHED" }),
    create: async () => ({
      existing: [],
      job: { ...pendingJob, proposals: undefined, status: "QUEUED" },
    }),
    list: async () => [],
    listDictionary: async () => dictionary,
    run: async () => pendingJob,
    updateProposal: async (_id, _code, update) => ({
      ...pendingJob,
      proposals: pendingJob.proposals?.map((proposal) => ({
        ...proposal,
        ...update,
      })),
    }),
    ...overrides,
  };
}

describe("ReviewPage", () => {
  afterEach(cleanup);

  it("提供固定尺寸批量输入、翻译服务，并且不显示审核任务或付费兜底", async () => {
    render(<ReviewPage api={fakeApi()} />);

    const input = screen.getByLabelText("批量词条输入");
    expect(input.classList.contains("entries-textarea")).toBe(true);
    expect(screen.getByLabelText("翻译服务")).not.toBeNull();
    expect(screen.queryByLabelText("审核任务")).toBeNull();
    expect(screen.queryByLabelText("允许付费服务兜底")).toBeNull();
  });

  it("使用 Ant Design 表格展示完整词典，并按 20 条分页", async () => {
    render(<ReviewPage api={fakeApi()} />);

    const table = await screen.findByRole("table");
    expect(table.closest(".ant-table")).not.toBeNull();
    for (const heading of ["编号", "中文", "英文"]) {
      expect(
        within(table).getByRole("columnheader", { name: heading }),
      ).not.toBeNull();
    }
    expect(screen.getByText("共 2 条")).not.toBeNull();
  });

  it("支持编号精确搜索，并在翻译后展示审核确认流程", async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockResolvedValue({
      existing: [],
      job: { ...pendingJob, proposals: undefined, status: "QUEUED" },
    });
    render(<ReviewPage api={fakeApi({ create })} />);

    await user.click(screen.getByLabelText("搜索方式"));
    await user.click(screen.getByText("编号搜索"));
    await user.type(screen.getByLabelText("搜索词条"), "P000042");
    expect(await screen.findByText("剩余秒数")).not.toBeNull();
    expect(screen.queryByText("开始游戏")).toBeNull();

    fireEvent.change(screen.getByLabelText("批量词条输入"), {
      target: { value: "剩余 {0} 秒" },
    });
    await user.click(screen.getByRole("button", { name: "开始翻译" }));
    expect(create).toHaveBeenCalledWith({
      entries: ["剩余 {0} 秒"],
      provider: "auto",
    });
    expect(
      await screen.findByRole("button", { name: "审核通过 P000042" }),
    ).not.toBeNull();
  });
});
