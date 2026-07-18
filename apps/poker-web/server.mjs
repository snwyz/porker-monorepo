/**
 * Poker Web 的自定义服务入口：默认在 http://127.0.0.1:3000 提供 Next.js 网页。
 * 普通 Web/HTTP 请求交由 Next.js 处理；/socket.io 的 WS（实时双向通信）请求
 * 会转发到 GAME_SERVER_URL（默认 http://127.0.0.1:3001）对应的游戏服务。
 */
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import next from "next";
import nextConfigModule from "next/dist/server/config.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "3000");
const gameServer = new URL(
  process.env.GAME_SERVER_URL ?? "http://127.0.0.1:3001",
);
const loadConfig = nextConfigModule.default;
const phase = dev ? "phase-development-server" : "phase-production-server";
const conf = await loadConfig(phase, process.cwd());
const app = next({ dev, hostname, port, conf });
const handle = app.getRequestHandler();

await app.prepare();
const handleUpgrade = app.getUpgradeHandler();

const server = http.createServer((request, response) => {
  void handle(request, response);
});

server.on("upgrade", (request, socket, head) => {
  if (!request.url?.startsWith("/socket.io")) {
    void handleUpgrade(request, socket, head);
    return;
  }

  const connect = gameServer.protocol === "https:" ? tls.connect : net.connect;
  const upstream = connect(
    {
      host: gameServer.hostname,
      port: Number(
        gameServer.port || (gameServer.protocol === "https:" ? 443 : 80),
      ),
    },
    () => {
      const headers = Object.entries(request.headers)
        .filter(([name]) => name.toLowerCase() !== "host")
        .flatMap(([name, value]) =>
          Array.isArray(value)
            ? value.map((item) => `${name}: ${item}`)
            : value === undefined
              ? []
              : [`${name}: ${value}`],
        );
      upstream.write(
        `${request.method ?? "GET"} ${request.url} HTTP/${request.httpVersion}\r\nHost: ${gameServer.host}\r\n${headers.join("\r\n")}\r\n\r\n`,
      );
      if (head.length > 0) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    },
  );

  const close = () => socket.destroy();
  upstream.on("error", close);
  socket.on("error", () => upstream.destroy());
});

server.listen(port, hostname);
