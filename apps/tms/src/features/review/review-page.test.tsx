import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReviewPage, type TmsApi, type TranslationJob } from "./review-page";

const pendingJob: TranslationJob = {
  id: "job-1",
  codes: ["P00042"],
  model: "fake-model",
  provider: "codex-cli",
  proposals: [
    {
      code: "P00042",
      decision: "PENDING_REVIEW",
      en: "{0} seconds remaining",
      params: [0],
      sources: ["packages/i18n/src/locales/en.json"],
      "zh-CN": "候选 {0}",
    },
  ],
  status: "PENDING_REVIEW",
};

function fakeApi(): TmsApi {
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
  };
}

describe("ReviewPage", () => {
  afterEach(cleanup);

  it("starts an auto job and lets a reviewer edit Chinese by keyboard label", async () => {
    const user = userEvent.setup();
    render(<ReviewPage api={fakeApi()} />);

    await user.selectOptions(screen.getByLabelText("Provider"), "auto");
    await user.click(screen.getByRole("button", { name: "Start translation" }));

    expect(await screen.findByText("P00042")).not.toBeNull();
    const chinese = screen.getByLabelText(
      "Chinese for P00042",
    ) as HTMLInputElement;
    await user.clear(chinese);
    await user.type(chinese, "Chinese for P00042");
    expect(chinese.value).toBe("Chinese for P00042");
  });

  it("requires every entry to be approved before final approval", async () => {
    const user = userEvent.setup();
    render(<ReviewPage api={fakeApi()} />);

    await user.click(screen.getByRole("button", { name: "Start translation" }));
    expect(
      (
        (await screen.findByRole("button", {
          name: "Publish 1 approved entries",
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Approve P00042" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Publish 1 approved entries",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("blocks final approval when an approved entry has invalid placeholders", async () => {
    const user = userEvent.setup();
    const invalidApprovedJob: TranslationJob = {
      ...pendingJob,
      proposals: pendingJob.proposals?.map((proposal) => ({
        ...proposal,
        decision: "APPROVED",
        "zh-CN": "候选翻译",
      })),
    };
    const api: TmsApi = {
      ...fakeApi(),
      run: async () => invalidApprovedJob,
    };
    render(<ReviewPage api={api} />);

    await user.click(screen.getByRole("button", { name: "Start translation" }));

    expect(
      (
        await screen.findByRole("button", {
          name: "Publish 1 approved entries",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("sends explicit paid fallback confirmation without sending credentials", async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockResolvedValue({
      ...pendingJob,
      proposals: undefined,
      status: "QUEUED",
    });
    render(<ReviewPage api={{ ...fakeApi(), create }} />);

    await user.click(screen.getByLabelText("Approve paid fallback"));
    await user.click(screen.getByRole("button", { name: "Start translation" }));

    expect(create).toHaveBeenCalledWith({
      approvePaidFallback: true,
      codes: ["P00042"],
      provider: "auto",
    });
  });
});
