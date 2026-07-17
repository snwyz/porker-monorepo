import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { pingDatabase } from "@poker/db";
import net from "node:net";
import { performance } from "node:perf_hooks";
import tls from "node:tls";

const HEALTH_TIMEOUT_MS = 1_000;

function redisCommand(parts: readonly string[]): string {
  return `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join("")}`;
}

export function pingRedis(redisUrl = process.env.REDIS_URL): Promise<void> {
  if (!redisUrl) return Promise.reject(new Error("REDIS_URL is required"));
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    return Promise.reject(new Error("REDIS_URL must use redis or rediss"));
  }

  return new Promise((resolve, reject) => {
    const secure = url.protocol === "rediss:";
    const socket = secure
      ? tls.connect({ host: url.hostname, port: Number(url.port || 6380) })
      : net.connect({ host: url.hostname, port: Number(url.port || 6379) });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve();
    };
    socket.setTimeout(HEALTH_TIMEOUT_MS, () =>
      finish(new Error("Redis readiness timeout")),
    );
    socket.once("error", finish);
    socket.once("connect", () => {
      const commands: string[] = [];
      if (url.password) commands.push(redisCommand(["AUTH", url.password]));
      commands.push(redisCommand(["PING"]));
      socket.write(commands.join(""));
    });
    socket.on("data", (chunk) => {
      const response = chunk.toString("utf8");
      if (response.includes("-ERR")) {
        finish(new Error("Redis rejected readiness probe"));
      } else if (response.includes("+PONG")) {
        finish();
      }
    });
  });
}

@Controller("health")
export class HealthController {
  @Get("live")
  live() {
    return { status: "live" as const };
  }

  @Get("event-loop")
  async eventLoop() {
    const startedAt = performance.now();
    await new Promise<void>((resolve) => setImmediate(resolve));
    return { lagMs: performance.now() - startedAt };
  }

  @Get("ready")
  async ready() {
    try {
      await Promise.all([pingDatabase(), pingRedis()]);
      return {
        status: "ready" as const,
        dependencies: { postgres: "up" as const, redis: "up" as const },
      };
    } catch {
      throw new ServiceUnavailableException(
        "Service dependencies are not ready",
      );
    }
  }
}
