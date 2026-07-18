import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
      sources: ["packages/i18n/src/locales/zh-CN.json"],
      "zh-CN": "剩余 {0} 秒",
    },
  ],
  status: "PENDING_REVIEW",
};

function fakeApi(overrides: Partial<TmsApi> = {}): TmsApi {
  return {
    approve: async () => ({ ...pendingJob, status: "PUBLISHED" }),
    create: async () => ({
      ...pendingJob,
      proposals: undefined,
      status: "QUEUED",
    }),
    list: async () => [],
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

  it("使用中文 Ant Design 表格展示固定四列和两个可编辑字段", async () => {
    const user = userEvent.setup();
    render(<ReviewPage api={fakeApi()} />);

    await user.click(screen.getByRole("button", { name: "开始翻译" }));

    const table = await screen.findByRole("table");
    expect(table.closest(".ant-table")).not.toBeNull();
    for (const heading of ["编号", "英文原文", "中文译文", "审核状态"]) {
      expect(within(table).getByRole("columnheader", { name: heading })).not.toBeNull();
    }
    expect(within(table).queryByText(/占位符|Placeholders/i)).toBeNull();
    expect(within(table).getByText("待审核")).not.toBeNull();

    const english = within(table).getByLabelText(
      "英文原文 P000042",
    ) as HTMLInputElement;
    const chinese = within(table).getByLabelText(
      "中文译文 P000042",
    ) as HTMLInputElement;
    expect(english.classList.contains("ant-input")).toBe(true);
    expect(chinese.classList.contains("ant-input")).toBe(true);
    fireEvent.change(english, { target: { value: "{0} seconds left" } });
    fireEvent.change(chinese, { target: { value: "还剩 {0} 秒" } });

    expect(english.value).toBe("{0} seconds left");
    expect(chinese.value).toBe("还剩 {0} 秒");
  });

  it("展示服务返回的六位编号，并把显式付费确认发送给 API", async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockResolvedValue({
      ...pendingJob,
      proposals: undefined,
      status: "QUEUED",
    });
    render(<ReviewPage api={fakeApi({ create })} />);

    await user.click(screen.getByLabelText("允许付费服务兜底"));
    await user.click(screen.getByRole("button", { name: "开始翻译" }));

    expect(await screen.findByText("P000042")).not.toBeNull();
    expect(screen.getByText("P000042").textContent).toMatch(/^P\d{6}$/);
    expect(create).toHaveBeenCalledWith({
      approvePaidFallback: true,
      codes: ["P000042"],
      provider: "auto",
    });
  });

  it("通过 Modal 二次确认后调用确认写入 API，并显示中文成功反馈", async () => {
    const user = userEvent.setup();
    const approve = vi.fn().mockResolvedValue({
      ...pendingJob,
      proposals: pendingJob.proposals?.map((proposal) => ({
        ...proposal,
        decision: "APPROVED" as const,
      })),
      status: "PUBLISHED",
    });
    render(<ReviewPage api={fakeApi({ approve })} />);

    await user.click(screen.getByRole("button", { name: "开始翻译" }));
    await user.click(
      await screen.findByRole("button", { name: "审核通过 P000042" }),
    );
    await user.click(screen.getByRole("button", { name: "确认写入" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("确认写入翻译？")).not.toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "确认写入" }));

    expect(approve).toHaveBeenCalledWith("job-1");
    expect((await screen.findByRole("status")).textContent).toContain("写入成功");
  });

  it("确认写入失败时显示中文错误反馈", async () => {
    const user = userEvent.setup();
    render(
      <ReviewPage
        api={fakeApi({
          approve: vi.fn().mockRejectedValue(new Error("network failed")),
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "开始翻译" }));
    await user.click(
      await screen.findByRole("button", { name: "审核通过 P000042" }),
    );
    await user.click(screen.getByRole("button", { name: "确认写入" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "确认写入",
      }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain("写入失败");
  });
});
