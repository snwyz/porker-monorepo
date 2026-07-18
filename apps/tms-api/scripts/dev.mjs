import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { resolve } from "node:path";

const entry = resolve("dist/src/main.js");
const outputDirectory = resolve("dist");
const host = process.env.HOST ?? "127.0.0.1";
const port = process.env.PORT ?? "4001";
let api;
let restartTimer;
let stopping = false;

console.log("[TMS API] 正在监听 TypeScript 编译结果…");

const compiler = spawn(
  "pnpm",
  ["exec", "tsc", "--watch", "--project", "tsconfig.json"],
  {
    stdio: "inherit",
  },
);

function startApi() {
  if (stopping || !existsSync(entry)) return;
  const restarting = api !== undefined;
  api?.kill("SIGTERM");
  const nextApi = spawn(process.execPath, [entry], {
    env: { ...process.env, HOST: host, PORT: port },
    stdio: "inherit",
  });
  api = nextApi;
  console.log(
    restarting
      ? `[TMS API] 编译完成，正在重启：http://${host}:${port}`
      : `[TMS API] 已启动：http://${host}:${port}`,
  );
  nextApi.on("exit", () => {
    if (!stopping && api === nextApi) api = undefined;
  });
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(startApi, 150);
}

const waitForInitialBuild = setInterval(() => {
  if (!existsSync(entry)) return;
  clearInterval(waitForInitialBuild);
  startApi();
  watch(outputDirectory, { recursive: true }, scheduleRestart);
}, 100);

function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  clearInterval(waitForInitialBuild);
  clearTimeout(restartTimer);
  api?.kill("SIGTERM");
  compiler.kill("SIGTERM");
  console.log("[TMS API] 开发服务已停止。");
  process.exit(exitCode);
}

compiler.on("exit", (code) => stop(code ?? 1));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
