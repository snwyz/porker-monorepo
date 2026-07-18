import type { INestApplication } from "@nestjs/common";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/main.js";
import { TranslationsService } from "../src/translations/translations.service.js";

describe("translation approval API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let dataDir: string;
  let enFile: string;
  let zhFile: string;
  let translatedEntries: readonly Record<string, unknown>[];

  async function api(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  }

  async function createJob(codes = ["P000042"]): Promise<{ id: string }> {
    const response = await api("/v1/jobs", {
      body: JSON.stringify({ codes, provider: "auto" }),
      method: "POST",
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  async function startApp(
    replaceLocaleFile: typeof rename = rename,
  ): Promise<void> {
    app = await createApp({
      dataDirectory: dataDir,
      i18nFiles: { enFile, zhFile },
      replaceLocaleFile,
      translationExecutor: {
        async translate({ entries }) {
          translatedEntries = entries;
          return {
            model: "fake-model",
            proposals: entries.map((entry) => ({
              ...entry,
              en: `English suggestion ${entry.code} {0}`,
            })),
            provider: "codex-cli" as const,
          };
        },
      },
    });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "poker-tms-approval-"));
    enFile = join(dataDir, "en.json");
    zhFile = join(dataDir, "zh-CN.json");
    await Promise.all([
      writeFile(enFile, '{"P000042":"Old English {0}"}\n'),
      writeFile(zhFile, '{"P000042":"旧中文 {0}","P000043":"新增中文 {0}"}\n'),
    ]);
    delete process.env.TMS_DATA_DIR;
    translatedEntries = [];
    await startApp();
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { force: true, recursive: true });
  });

  it("uses Chinese source text to generate an English suggestion", async () => {
    const job = await createJob(["P000043"]);

    expect(
      (await api(`/v1/jobs/${job.id}/run`, { method: "POST" })).status,
    ).toBe(202);
    expect(translatedEntries).toEqual([
      {
        "zh-CN": "新增中文 {0}",
        code: "P000043",
        params: [0],
        sources: [zhFile],
      },
    ]);
    expect(await (await api(`/v1/jobs/${job.id}`)).json()).toMatchObject({
      proposals: [
        {
          "zh-CN": "新增中文 {0}",
          code: "P000043",
          en: "English suggestion P000043 {0}",
        },
      ],
    });
  });

  it("writes only approved rows incrementally to both locale files", async () => {
    const job = await createJob(["P000042", "P000043"]);
    await api(`/v1/jobs/${job.id}/run`, { method: "POST" });
    expect(
      (
        await api(`/v1/jobs/${job.id}/proposals/P000042`, {
          body: JSON.stringify({
            "zh-CN": "不应写入 {0}",
            decision: "REJECTED",
            en: "Must not be written {0}",
          }),
          method: "PATCH",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api(`/v1/jobs/${job.id}/proposals/P000043`, {
          body: JSON.stringify({
            "zh-CN": "已批准中文 {0}",
            decision: "APPROVED",
            en: "Approved English {0}",
          }),
          method: "PATCH",
        })
      ).status,
    ).toBe(200);

    expect(
      (await api(`/v1/jobs/${job.id}/approve`, { method: "POST" })).status,
    ).toBe(200);
    expect(JSON.parse(await readFile(enFile, "utf8"))).toEqual({
      P000042: "Old English {0}",
      P000043: "Approved English {0}",
    });
    expect(JSON.parse(await readFile(zhFile, "utf8"))).toEqual({
      P000042: "旧中文 {0}",
      P000043: "已批准中文 {0}",
    });
  });

  it("keeps both locale files unchanged when placeholders do not match", async () => {
    const beforeEn = await readFile(enFile, "utf8");
    const beforeZh = await readFile(zhFile, "utf8");
    const job = await createJob(["P000043"]);
    await api(`/v1/jobs/${job.id}/run`, { method: "POST" });
    await api(`/v1/jobs/${job.id}/proposals/P000043`, {
      body: JSON.stringify({
        "zh-CN": "新增中文 {0}",
        decision: "APPROVED",
        en: "Missing placeholder",
      }),
      method: "PATCH",
    });

    expect(
      (await api(`/v1/jobs/${job.id}/approve`, { method: "POST" })).status,
    ).toBe(400);
    expect(await readFile(enFile, "utf8")).toBe(beforeEn);
    expect(await readFile(zhFile, "utf8")).toBe(beforeZh);
  });

  it("restores the first locale when replacing the second locale fails", async () => {
    await app.close();
    let replacements = 0;
    await startApp(async (source, destination) => {
      replacements += 1;
      if (replacements === 2)
        throw new Error("simulated second replace failure");
      await rename(source, destination);
    });
    const beforeEn = await readFile(enFile, "utf8");
    const beforeZh = await readFile(zhFile, "utf8");
    const job = await createJob(["P000043"]);
    await api(`/v1/jobs/${job.id}/run`, { method: "POST" });
    await api(`/v1/jobs/${job.id}/proposals/P000043`, {
      body: JSON.stringify({
        "zh-CN": "失败中文 {0}",
        decision: "APPROVED",
        en: "Failed English {0}",
      }),
      method: "PATCH",
    });

    expect(
      (await api(`/v1/jobs/${job.id}/approve`, { method: "POST" })).status,
    ).toBe(500);
    expect(await readFile(enFile, "utf8")).toBe(beforeEn);
    expect(await readFile(zhFile, "utf8")).toBe(beforeZh);
    expect(await (await api(`/v1/jobs/${job.id}`)).json()).toMatchObject({
      status: "PUBLISH_FAILED",
    });
  });

  it("allocates the next six-digit code and rejects an exhausted range", async () => {
    const translations = app.get(TranslationsService);

    await expect(translations.allocateNextCode()).resolves.toBe("P000044");
    await writeFile(zhFile, '{"P999999":"编号已耗尽"}\n');
    await expect(translations.allocateNextCode()).rejects.toThrow(
      "message code range is exhausted",
    );
  });
});
