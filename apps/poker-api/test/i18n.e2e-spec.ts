import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GameGateway } from "../src/game/game.gateway.js";
import {
  LocaleContextMiddleware,
  type LocaleAwareRequest,
} from "../src/i18n/locale-context.middleware.js";
import { createApp } from "../src/main.js";

function connect(url: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      transports: ["websocket"],
      extraHeaders: { Cookie: "poker_locale=zh-CN" },
      forceNew: true,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function emitAck<T>(
  socket: Socket,
  event: string,
  payload: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Ack timeout for ${event}`)),
      1_000,
    );
    socket.emit(event, payload, (result: T) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

describe("localized HTTP and Socket.IO error contracts", () => {
  let app: INestApplication;
  let baseUrl: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    process.env.APP_MODE = "points";
    app = await createApp();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await app.close();
  });

  it("returns a stable HTTP problem for invalid nickname input", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/guest-session")
      .send({ nickname: "ab" })
      .expect(400);

    expect(response.body).toEqual({
      code: "P000170",
      params: { 0: "nickname" },
    });
  });

  it("stores the locale cookie over Accept-Language as HTTP request context", () => {
    const request: LocaleAwareRequest = {
      cookies: { poker_locale: "en" },
      headers: { "accept-language": "zh-CN,zh;q=0.9" },
    };
    const next = () => undefined;

    new LocaleContextMiddleware().use(request, {}, next);

    expect(request.locale).toBe("en");
  });

  it("uses the locale cookie handshake while returning a stable socket error", async () => {
    const socket = await connect(baseUrl);
    sockets.push(socket);

    await expect(
      emitAck(socket, "table:join", { roomId: "room-1", seat: -1, buyIn: 0 }),
    ).resolves.toEqual({ ok: false, code: "P000176" });

    const gateway = app.get(GameGateway) as unknown as {
      server: {
        sockets: { sockets: Map<string, { data: { locale?: string } }> };
      };
    };
    expect(gateway.server.sockets.sockets.get(socket.id!)?.data.locale).toBe(
      "zh-CN",
    );
  });
});
