import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(appRoot, "../..");
const authorityRoot = resolve(repositoryRoot, "i18n-data/web");
const authority = {
  en: resolve(authorityRoot, "en.json"),
  "zh-CN": resolve(authorityRoot, "zh-CN.json"),
};
const runtime = {
  en: resolve(appRoot, "src/locales/en.json"),
  "zh-CN": resolve(appRoot, "src/locales/zh-CN.json"),
};

function validate(dictionary, name) {
  if (!dictionary || Array.isArray(dictionary) || typeof dictionary !== "object") {
    throw new Error(`${name} 不是对象词典`);
  }
  for (const [code, value] of Object.entries(dictionary)) {
    if (!/^P(?!000000$)\d{6}$/.test(code) || typeof value !== "string" || value.length === 0) {
      throw new Error(`${name} 包含无效词条：${code}`);
    }
  }
}

function tokens(value) {
  return [...new Set([...value.matchAll(/\{(\d+)\}/g)].map((match) => match[1]))].sort();
}

function validatePair(en, zh) {
  validate(en, "en.json");
  validate(zh, "zh-CN.json");
  const enCodes = Object.keys(en).sort();
  const zhCodes = Object.keys(zh).sort();
  if (JSON.stringify(enCodes) !== JSON.stringify(zhCodes)) {
    throw new Error("中英文权威词典的编码集合不一致");
  }
  for (const code of enCodes) {
    if (JSON.stringify(tokens(en[code])) !== JSON.stringify(tokens(zh[code]))) {
      throw new Error(`${code} 的中英文占位符不一致`);
    }
  }
}

async function replace(target, value) {
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

async function bootstrapAuthority() {
  if (existsSync(authority.en) || existsSync(authority["zh-CN"])) return;
  await mkdir(authorityRoot, { recursive: true });
  await Promise.all([
    cp(resolve(repositoryRoot, "packages/i18n/src/locales/en.json"), authority.en),
    cp(resolve(repositoryRoot, "packages/i18n/src/locales/zh-CN.json"), authority["zh-CN"]),
  ]);
}

await bootstrapAuthority();
const [en, zh] = await Promise.all([
  readFile(authority.en, "utf8").then(JSON.parse),
  readFile(authority["zh-CN"], "utf8").then(JSON.parse),
]);
validatePair(en, zh);
await mkdir(dirname(runtime.en), { recursive: true });
await Promise.all([replace(runtime.en, en), replace(runtime["zh-CN"], zh)]);
