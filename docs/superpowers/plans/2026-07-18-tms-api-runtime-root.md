# TMS API 运行时仓库根目录解析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TMS API 从 `dist/src/main.js` 启动时正确找到默认 i18n 文件。

**Architecture:** 新增独立的异步仓库根目录解析器，从模块文件路径所在目录向上查找 `pnpm-workspace.yaml`。`main.ts` 在未注入 i18n 文件路径时调用该解析器，以避免依赖编译前后的固定相对层级。

**Tech Stack:** TypeScript、Node.js `fs/promises`、Node.js `path`、Vitest、NestJS。

## Global Constraints

- 只读取工作区标记文件 `pnpm-workspace.yaml`，不读取或写入真实 i18n 源文件。
- 保持 `TMS_DATA_DIR` 必须位于仓库外的现有约束。
- 不修改审批、快照发布、候选文件生成或翻译提供商逻辑。
- 测试只写系统临时目录。

---

### Task 1: 解析编译产物对应的仓库根目录

**Files:**
- Create: `apps/tms-api/src/runtime/repository-root.ts`
- Create: `apps/tms-api/test/repository-root.spec.ts`
- Modify: `apps/tms-api/src/main.ts`

**Interfaces:**
- Produces: `findRepositoryRoot(moduleFile: string): Promise<string>`，返回包含 `pnpm-workspace.yaml` 的绝对目录；向上搜索至文件系统根目录仍未找到时抛出 `Error("Unable to find repository root")`。
- Consumes: `main.ts` 的 `fileURLToPath(import.meta.url)`，用于构造默认 i18n 文件路径。

- [ ] **Step 1: 写失败测试。**

在 `apps/tms-api/test/repository-root.spec.ts` 中创建下列测试。它构造 `apps/tms-api/dist/src/main.js` 的编译路径并断言能找到临时工作区根目录；该文件名匹配当前 Vitest 的 `test/**/*.spec.ts` 规则。在解析器不存在时，测试会因模块缺失而失败。

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findRepositoryRoot } from "../src/runtime/repository-root.js";

describe("findRepositoryRoot", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ));
  });

  it("finds the workspace root from a compiled TMS API module path", async () => {
    const root = await mkdtemp(join(tmpdir(), "poker-tms-root-"));
    directories.push(root);
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []\n");

    await expect(
      findRepositoryRoot(join(root, "apps/tms-api/dist/src/main.js")),
    ).resolves.toBe(root);
  });
});
```

- [ ] **Step 2: 验证 RED。**

运行：

```bash
pnpm --config.verify-deps-before-run=ignore --filter @poker/tms-api test -- repository-root.spec.ts
```

预期：失败，错误指出 `../src/runtime/repository-root.js` 尚不存在。

- [ ] **Step 3: 实现最小解析器并接入默认 i18n 路径。**

创建 `apps/tms-api/src/runtime/repository-root.ts`：

```ts
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function findRepositoryRoot(moduleFile: string): Promise<string> {
  let directory = dirname(moduleFile);
  while (true) {
    try {
      await access(join(directory, "pnpm-workspace.yaml"));
      return directory;
    } catch {
      const parent = dirname(directory);
      if (parent === directory) {
        throw new Error("Unable to find repository root");
      }
      directory = parent;
    }
  }
}
```

在 `apps/tms-api/src/main.ts` 中删除模块级 `repositoryRoot` 常量，导入 `findRepositoryRoot`，并在 `createApp` 开始处加入：

```ts
const repositoryRoot = await findRepositoryRoot(
  fileURLToPath(import.meta.url),
);
```

其余默认 `catalogFile`、`enFile` 与 `zhFile` 的 `resolve(repositoryRoot, ...)` 调用保持不变。

- [ ] **Step 4: 验证 GREEN。**

依次运行：

```bash
pnpm --config.verify-deps-before-run=ignore --filter @poker/tms-api test -- repository-root.spec.ts
pnpm --config.verify-deps-before-run=ignore --filter @poker/tms-api test -- approval.e2e-spec.ts
pnpm --config.verify-deps-before-run=ignore --filter @poker/tms-api typecheck
pnpm --config.verify-deps-before-run=ignore --filter @poker/tms-api lint
pnpm --config.verify-deps-before-run=ignore --filter @poker/tms-api build
```

预期：所有命令以退出码 0 完成。

- [ ] **Step 5: 通过浏览器复验本地启动。**

使用同一 `TMS_DATA_DIR=/tmp/poker-tms-api` 和 `POKER_CODEX_EXECUTABLE=/Applications/ChatGPT.app/Contents/Resources/codex` 重启编译产物。刷新 `http://localhost:3000`，选择 `codex-cli` 并启动任务；预期不再出现默认 i18n 文件路径导致的“Could not start translation.”。

- [ ] **Step 6: Git 门禁与提交。**

仅暂存 `repository-root.ts`、`repository-root.test.ts`、`main.ts` 和本计划文件。提交前检查暂存文件清单、体积、`git diff --check`、忽略规则，以及 `.next`、`dist`、`coverage`、`node_modules` 等生成目录未被跟踪；确认不含临时 TMS 数据。
