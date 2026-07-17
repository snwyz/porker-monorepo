import type { INestApplication } from "@nestjs/common";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/main.js";
import { readTmsDataDirectory } from "../src/jobs/job.repository.js";

describe("translation jobs API", () => {
  let app: INestApplication;
  let baseUrl: string;
  let dataDir: string;

  async function api(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init.headers,
      },
    });
  }

  async function startApp(): Promise<void> {
    app = await createApp();
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "poker-tms-api-"));
    process.env.TMS_DATA_DIR = dataDir;
    await startApp();
  });

  afterAll(async () => {
    await app.close();
    await rm(dataDir, { force: true, recursive: true });
    delete process.env.TMS_DATA_DIR;
  });

  it("creates a queued job and reads it by id", async () => {
    const createdResponse = await api("/v1/jobs", {
      body: JSON.stringify({ provider: "auto", codes: ["P00042"] }),
      method: "POST",
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();

    expect(created).toMatchObject({
      codes: ["P00042"],
      provider: "auto",
      status: "QUEUED",
    });
    expect(created.id).toMatch(/^[-\da-f]{36}$/i);

    const foundResponse = await api(`/v1/jobs/${created.id}`);
    expect(foundResponse.status).toBe(200);
    const found = await foundResponse.json();

    expect(found).toMatchObject({ id: created.id });
  });

  it("lists jobs and restores them after an application restart", async () => {
    const createdResponse = await api("/v1/jobs", {
      body: JSON.stringify({ provider: "auto", codes: ["P00043"] }),
      method: "POST",
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();

    await app.close();
    await startApp();

    const jobsResponse = await api("/v1/jobs");
    expect(jobsResponse.status).toBe(200);
    expect(await jobsResponse.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
  });

  it("rejects malformed job payloads", async () => {
    const response = await api("/v1/jobs", {
      body: JSON.stringify({ provider: "not-a-provider", codes: [] }),
      method: "POST",
    });
    expect(response.status).toBe(400);
  });

  it("rejects an external symlink that resolves inside the repository", async () => {
    const linkedDirectory = join(dataDir, "repository-link");
    await symlink(resolve(process.cwd(), "../.."), linkedDirectory);

    await expect(
      readTmsDataDirectory(join(linkedDirectory, "future-job-data")),
    ).rejects.toThrow("TMS_DATA_DIR must be outside the repository");
  });
});
