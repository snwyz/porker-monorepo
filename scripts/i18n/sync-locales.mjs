import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const appsDir = resolve(rootDir, "apps");
const argumentApp = process.argv.slice(2).reduce((target, argument, index, args) => {
  if (argument === "--app") return args[index + 1] ?? target;
  return target;
}, undefined);
const targetApp = argumentApp ?? process.env.TARGET_APP;

if (process.env.SKIP_I18N_SYNC === "true") {
  console.log("已跳过 i18n 同步（SKIP_I18N_SYNC=true）");
  process.exit(0);
}

function readPackage(appPath) {
  const packagePath = resolve(appPath, "package.json");
  if (!existsSync(packagePath)) return undefined;
  return JSON.parse(readFileSync(packagePath, "utf8"));
}

function findApps() {
  if (!existsSync(appsDir)) return [];

  return readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: resolve(appsDir, entry.name) }))
    .filter((app) => !targetApp || app.name === targetApp)
    .map((app) => ({ ...app, packageJson: readPackage(app.path) }))
    .filter((app) => app.packageJson?.scripts?.updateI18nResource);
}

const apps = findApps();

if (targetApp && apps.length === 0) {
  console.error(`未找到声明 updateI18nResource 的应用：${targetApp}`);
  process.exit(1);
}

if (apps.length === 0) {
  console.log("没有应用声明 updateI18nResource，已跳过 i18n 同步。");
  process.exit(0);
}

for (const app of apps) {
  console.log(`正在同步 ${app.name} 的 i18n 资源…`);
  const result = spawnSync("pnpm", ["run", "updateI18nResource"], {
    cwd: app.path,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`${app.name} 的 i18n 同步无法启动：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${app.name} 的 i18n 同步失败。`);
    process.exit(result.status ?? 1);
  }
}

console.log("i18n 资源同步完成。");
