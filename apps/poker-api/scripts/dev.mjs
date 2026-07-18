import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { resolve } from 'node:path';

const entry = resolve('dist/apps/poker-api/src/main.js');
const outputDirectory = resolve('dist');
const sourceDirectory = resolve('src');
const host = process.env.HOST ?? '127.0.0.1';
const port = process.env.PORT ?? '3001';
let api;
let restartTimer;
let stopping = false;
let starting = false;
let sourceWatcher;

console.log('[Poker API] 正在监听 TypeScript 编译结果…');

const compiler = spawn(
  'pnpm',
  ['exec', 'tsc', '--watch', '--project', 'tsconfig.json'],
  {
    stdio: 'inherit',
  },
);

async function startApi() {
  if (stopping || starting || !existsSync(entry)) return;
  starting = true;
  const restarting = api !== undefined;
  try {
    const previousApi = api;
    if (previousApi?.exitCode === null) {
      await new Promise((resolve) => {
        previousApi.once('exit', resolve);
        previousApi.kill('SIGTERM');
      });
    }

    if (stopping) return;
    const nextApi = spawn(process.execPath, [entry], {
      env: { ...process.env, HOST: host, PORT: port },
      stdio: 'inherit',
    });
    api = nextApi;
    console.log(
      restarting
        ? `[Poker API] 编译完成，正在重启：http://${host}:${port}`
        : `[Poker API] 已启动：http://${host}:${port}`,
    );
    nextApi.on('exit', () => {
      if (!stopping && api === nextApi) api = undefined;
    });
  } finally {
    starting = false;
  }
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => void startApi(), 600);
}

const waitForInitialBuild = setInterval(() => {
  if (!existsSync(entry)) return;
  clearInterval(waitForInitialBuild);
  void startApi();
  watch(outputDirectory, { recursive: true }, scheduleRestart);
  sourceWatcher = watch(sourceDirectory, { recursive: true }, scheduleRestart);
}, 100);

function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  clearInterval(waitForInitialBuild);
  clearTimeout(restartTimer);
  sourceWatcher?.close();
  api?.kill('SIGTERM');
  compiler.kill('SIGTERM');
  console.log('[Poker API] 开发服务已停止。');
  process.exit(exitCode);
}

compiler.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
