import { type INestApplication, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HealthController } from "../src/health/health.controller.js";

@Module({ controllers: [HealthController] })
class HealthTestModule {}

describe("health endpoints", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.APP_MODE = "points";
    process.env.POKER_AUDIT_KEY = "test-audit-key-with-at-least-32-bytes";
    app = await NestFactory.create(HealthTestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports the process as live without consulting dependencies", async () => {
    const response = await request(app.getHttpServer())
      .get("/health/live")
      .expect(200);

    expect(response.body).toEqual({ status: "live" });
  });

  it("reports not ready when Redis cannot be reached", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:1";

    const response = await request(app.getHttpServer())
      .get("/health/ready")
      .expect(503);

    expect(response.body).toMatchObject({
      statusCode: 503,
      message: "Service dependencies are not ready",
    });
  });

  it("measures event-loop lag in the game-server process", async () => {
    const response = await request(app.getHttpServer())
      .get("/health/event-loop")
      .expect(200);

    expect(response.body.lagMs).toBeTypeOf("number");
    expect(response.body.lagMs).toBeGreaterThanOrEqual(0);
  });
});
