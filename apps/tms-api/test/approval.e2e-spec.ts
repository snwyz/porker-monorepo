import type { INestApplication } from "@nestjs/common";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/main.js";
import {
  createCandidateWriter,
  writeCandidate,
} from "../src/publication/candidate-writer.js";
import { SnapshotRepository } from "../src/publication/snapshot.repository.js";

describe("translation approval API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let dataDir: string;
  let catalogFile: string;
  let enFile: string;
  let zhFile: string;
  let currentSnapshotFile: string;
  let failRename = false;

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

  async function publishApprovedTranslation(
    translation: string,
  ): Promise<void> {
    const job = await createJob();
    expect(
      (await api(`/v1/jobs/${job.id}/run`, { method: "POST" })).status,
    ).toBe(202);
    expect(
      (
        await api(`/v1/jobs/${job.id}/proposals/P00042`, {
          body: JSON.stringify({ "zh-CN": translation, decision: "APPROVED" }),
          method: "PATCH",
        })
      ).status,
    ).toBe(200);
    expect(
      (await api(`/v1/jobs/${job.id}/approve`, { method: "POST" })).status,
    ).toBe(200);
  }

  async function startApp(
    snapshotRepository?: SnapshotRepository,
  ): Promise<void> {
    app = await createApp({
      i18nFiles: { catalogFile, enFile, zhFile },
      ...(snapshotRepository ? { snapshotRepository } : {}),
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
  }

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "poker-tms-approval-"));
    catalogFile = join(dataDir, "catalog.json");
    enFile = join(dataDir, "en.json");
    zhFile = join(dataDir, "zh-CN.json");
    currentSnapshotFile = join(dataDir, "published", "current.json");
    await Promise.all([
      writeFile(catalogFile, '{"P00042":[0]}\n'),
      writeFile(enFile, '{"P00042":"{0} seconds remaining"}\n'),
      writeFile(zhFile, '{"P00042":"旧译文 {0}"}\n'),
    ]);
    process.env.TMS_DATA_DIR = dataDir;
    await startApp();
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
    expect(await readFile(zhFile, "utf8")).toBe('{"P00042":"旧译文 {0}"}\n');
    expect(
      JSON.parse(await readFile(currentSnapshotFile, "utf8")),
    ).toMatchObject({
      version: 1,
      catalog: { P00042: [0] },
      en: { P00042: "{0} seconds remaining" },
      "zh-CN": { P00042: "剩余 {0} 秒" },
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

  it("preserves the prior snapshot and marks a job failed when rename fails", async () => {
    await app.close();
    await rm(join(dataDir, "published"), { force: true, recursive: true });
    await startApp();
    await publishApprovedTranslation("基线 {0}");
    const beforeCatalog = await readFile(catalogFile, "utf8");
    const beforeZh = await readFile(zhFile, "utf8");
    const beforeSnapshot = await readFile(currentSnapshotFile, "utf8");
    await app.close();
    await startApp(
      new SnapshotRepository(
        join(dataDir, "published"),
        async (source, destination) => {
          if (failRename) throw new Error("simulated rename failure");
          await rename(source, destination);
        },
      ),
    );
    const job = await createJob();
    await api(`/v1/jobs/${job.id}/run`, { method: "POST" });
    await api(`/v1/jobs/${job.id}/proposals/P00042`, {
      body: JSON.stringify({
        "zh-CN": "失败时不发布 {0}",
        decision: "APPROVED",
      }),
      method: "PATCH",
    });
    failRename = true;

    expect(
      (await api(`/v1/jobs/${job.id}/approve`, { method: "POST" })).status,
    ).toBe(500);
    failRename = false;
    expect(await readFile(catalogFile, "utf8")).toBe(beforeCatalog);
    expect(await readFile(zhFile, "utf8")).toBe(beforeZh);
    expect(await readFile(currentSnapshotFile, "utf8")).toBe(beforeSnapshot);
    expect(await (await api(`/v1/jobs/${job.id}`)).json()).toMatchObject({
      status: "PUBLISH_FAILED",
    });
  });

  it("writes an explicit candidate from a published snapshot without changing source files", async () => {
    await app.close();
    await rm(join(dataDir, "published"), { force: true, recursive: true });
    await startApp();
    await publishApprovedTranslation("候选发布 {0}");
    const snapshot = await new SnapshotRepository(
      join(dataDir, "published"),
    ).read();
    if (!snapshot) throw new Error("Missing published snapshot");
    const candidateDirectory = join(dataDir, "candidates");
    const target = {
      catalogFile: join(candidateDirectory, "catalog.json"),
      zhFile: join(candidateDirectory, "zh-CN.json"),
    };

    await writeCandidate(
      new SnapshotRepository(join(dataDir, "published")),
      target,
    );

    expect(JSON.parse(await readFile(target.catalogFile, "utf8"))).toEqual(
      snapshot.catalog,
    );
    expect(JSON.parse(await readFile(target.zhFile, "utf8"))).toEqual(
      snapshot["zh-CN"],
    );
    expect(await readFile(zhFile, "utf8")).toBe('{"P00042":"旧译文 {0}"}\n');
  });

  it("leaves the snapshot and explicit source targets unchanged when candidate generation fails", async () => {
    const snapshot = await new SnapshotRepository(
      join(dataDir, "published"),
    ).read();
    if (!snapshot) throw new Error("Missing published snapshot");
    const beforeSnapshot = await readFile(currentSnapshotFile, "utf8");
    const beforeCatalog = await readFile(catalogFile, "utf8");
    const beforeZh = await readFile(zhFile, "utf8");
    let replacements = 0;
    const writer = createCandidateWriter(async (source, destination) => {
      replacements += 1;
      if (replacements === 2)
        throw new Error("simulated candidate rename failure");
      await rename(source, destination);
    });

    await expect(
      writer.writeCandidate(
        new SnapshotRepository(join(dataDir, "published")),
        { catalogFile, zhFile },
      ),
    ).rejects.toThrow("simulated candidate rename failure");

    expect(await readFile(currentSnapshotFile, "utf8")).toBe(beforeSnapshot);
    expect(await readFile(catalogFile, "utf8")).toBe(beforeCatalog);
    expect(await readFile(zhFile, "utf8")).toBe(beforeZh);
  });

  it("rejects candidate generation when no published snapshot exists", async () => {
    await expect(
      writeCandidate(
        new SnapshotRepository(join(dataDir, "no-published-snapshot")),
        { catalogFile, zhFile },
      ),
    ).rejects.toThrow("No published snapshot is available");
  });

  it("reports rollback failures instead of masking them", async () => {
    const snapshotRepository = new SnapshotRepository(
      join(dataDir, "published"),
    );
    const snapshot = await snapshotRepository.read();
    if (!snapshot) throw new Error("Missing published snapshot");
    let replacements = 0;
    const writer = createCandidateWriter(async (source, destination) => {
      replacements += 1;
      if (replacements === 2 || replacements === 3) {
        throw new Error(`simulated replace failure ${replacements}`);
      }
      await rename(source, destination);
    });

    await expect(
      writer.writeCandidate(snapshotRepository, { catalogFile, zhFile }),
    ).rejects.toThrow("Candidate generation and rollback failed");
  });
});
