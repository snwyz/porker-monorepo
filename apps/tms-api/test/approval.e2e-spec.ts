import type { INestApplication } from "@nestjs/common";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/main.js";
import { atomicPublisher } from "../src/approvals/approval.service.js";

describe("translation approval API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let dataDir: string;
  let catalogFile: string;
  let enFile: string;
  let zhFile: string;
  let failPublish = false;

  async function api(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  }

  async function createJob(): Promise<{ id: string }> {
    const response = await api("/v1/jobs", {
      body: JSON.stringify({ codes: ["P00042"], provider: "auto" }),
      method: "POST",
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "poker-tms-approval-"));
    catalogFile = join(dataDir, "catalog.json");
    enFile = join(dataDir, "en.json");
    zhFile = join(dataDir, "zh-CN.json");
    await Promise.all([
      writeFile(catalogFile, '{"P00042":[0]}\n'),
      writeFile(enFile, '{"P00042":"{0} seconds remaining"}\n'),
      writeFile(zhFile, '{"P00042":"旧译文 {0}"}\n'),
    ]);
    process.env.TMS_DATA_DIR = dataDir;
    app = await createApp({
      i18nFiles: { catalogFile, enFile, zhFile },
      publisher: {
        async publish(input) {
          if (failPublish) throw new Error("simulated write failure");
          await atomicPublisher.publish(input);
        },
      },
      translationExecutor: {
        async translate({ entries }) {
          return {
            model: "fake-model",
            proposals: entries.map((entry) => ({
              ...entry,
              "zh-CN": "候选 {0}",
            })),
            provider: "codex-cli" as const,
          };
        },
      },
    });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
    await rm(dataDir, { force: true, recursive: true });
    delete process.env.TMS_DATA_DIR;
  });

  it("runs a job, reviews its proposal, and publishes approved text", async () => {
    const job = await createJob();
    expect(
      (await api(`/v1/jobs/${job.id}/run`, { method: "POST" })).status,
    ).toBe(202);

    const edited = await api(`/v1/jobs/${job.id}/proposals/P00042`, {
      body: JSON.stringify({ "zh-CN": "剩余 {0} 秒", decision: "APPROVED" }),
      method: "PATCH",
    });
    expect(edited.status).toBe(200);
    expect(
      (await api(`/v1/jobs/${job.id}/approve`, { method: "POST" })).status,
    ).toBe(200);
    expect(JSON.parse(await readFile(zhFile, "utf8"))).toMatchObject({
      P00042: "剩余 {0} 秒",
    });
  });

  it("refuses approval when an approved edit changes placeholders", async () => {
    const job = await createJob();
    await api(`/v1/jobs/${job.id}/run`, { method: "POST" });
    await api(`/v1/jobs/${job.id}/proposals/P00042`, {
      body: JSON.stringify({ "zh-CN": "缺少参数", decision: "APPROVED" }),
      method: "PATCH",
    });

    expect(
      (await api(`/v1/jobs/${job.id}/approve`, { method: "POST" })).status,
    ).toBe(400);
  });

  it("preserves dictionaries and marks a job failed when publishing fails", async () => {
    const before = await readFile(zhFile, "utf8");
    const job = await createJob();
    await api(`/v1/jobs/${job.id}/run`, { method: "POST" });
    await api(`/v1/jobs/${job.id}/proposals/P00042`, {
      body: JSON.stringify({
        "zh-CN": "失败时不发布 {0}",
        decision: "APPROVED",
      }),
      method: "PATCH",
    });
    failPublish = true;

    expect(
      (await api(`/v1/jobs/${job.id}/approve`, { method: "POST" })).status,
    ).toBe(500);
    failPublish = false;
    expect(await readFile(zhFile, "utf8")).toBe(before);
    expect(await (await api(`/v1/jobs/${job.id}`)).json()).toMatchObject({
      status: "PUBLISH_FAILED",
    });
  });
});
