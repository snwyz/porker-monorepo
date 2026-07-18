# Codex JSONL 最终响应提取 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 Codex JSONL 事件流提取最终代理消息，使 TMS 翻译任务可生成提案。

**Architecture:** 保留 `codex exec --json` 调用；`codex-cli.ts` 逐行解析 stdout，只接受完成的代理消息事件并返回最后一条文本。后续既有 JSON schema 校验保持不变。

**Tech Stack:** TypeScript、Node.js 子进程、Vitest。

## Global Constraints

- 不改变 Codex 可执行文件配置、鉴权环境继承或 `exec --json` 参数。
- 不调用真实 Codex CLI；测试只使用注入的命令执行器。
- 不修改 TMS 任务、审批、快照发布或前端代码。

---

### Task 1: 提取 JSONL 中的最终代理消息

**Files:**
- Modify: `packages/agents/src/providers/codex-cli.ts`
- Modify: `packages/agents/src/providers/providers.test.ts`

**Interfaces:**
- Produces: `extractFinalAgentMessage(stdout: string): string`，返回最后一个 `{ type: "item.completed", item: { type: "agent_message", text: string } }` 事件的 `item.text`；无消息或无效 JSON 行时抛出 `Error("Codex CLI returned invalid JSONL")`。
- Consumes: `CommandResult.stdout`。

- [ ] **Step 1: 写失败测试。**

在 `providers.test.ts` 增加测试，注入下列 stdout，调用 `codex.complete(request)`，断言结果为最后一条代理消息而非整段 JSONL：

```ts
const stdout = [
  '{"type":"thread.started","thread_id":"thread-1"}',
  '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"value\\":1}"}}',
  '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"value\\":2}"}}',
].join("\n");
```

并增加无 `agent_message` 事件时拒绝 `Codex CLI returned invalid JSONL` 的测试。

- [ ] **Step 2: 验证 RED。**

运行：

```bash
pnpm --config.verify-deps-before-run=ignore --filter @poker/agents test -- providers.test.ts
```

预期：第一个新增测试失败，因为现有 `complete` 返回整个 JSONL stdout；第二个新增测试失败，因为现有实现不拒绝缺失最终消息。

- [ ] **Step 3: 实现最小提取器。**

在 `codex-cli.ts` 增加：

```ts
function extractFinalAgentMessage(stdout: string): string {
  let finalMessage: string | undefined;
  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;
    let event: unknown;
    try {
      event = JSON.parse(line) as unknown;
    } catch {
      throw new Error("Codex CLI returned invalid JSONL");
    }
    if (
      typeof event === "object" && event !== null &&
      (event as { type?: unknown }).type === "item.completed"
    ) {
      const item = (event as { item?: unknown }).item;
      if (
        typeof item === "object" && item !== null &&
        (item as { type?: unknown }).type === "agent_message" &&
        typeof (item as { text?: unknown }).text === "string"
      ) finalMessage = (item as { text: string }).text;
    }
  }
  if (finalMessage === undefined) throw new Error("Codex CLI returned invalid JSONL");
  return finalMessage;
}
```

将 `complete` 成功返回值改为 `{ text: extractFinalAgentMessage(result.stdout) }`。

- [ ] **Step 4: 验证 GREEN。**

依次运行：

```bash
pnpm --config.verify-deps-before-run=ignore --filter @poker/agents test -- providers.test.ts
pnpm --config.verify-deps-before-run=ignore --filter @poker/agents test
pnpm --config.verify-deps-before-run=ignore --filter @poker/agents typecheck
pnpm --config.verify-deps-before-run=ignore --filter @poker/agents lint
pnpm --config.verify-deps-before-run=ignore --filter @poker/agents build
```

预期：全部以退出码 0 完成。

- [ ] **Step 5: 本地浏览器复验。**

重新构建并启动 TMS API，保留 `TMS_DATA_DIR=/tmp/poker-tms-api` 和 `POKER_CODEX_EXECUTABLE=/Applications/ChatGPT.app/Contents/Resources/codex`。在 `http://localhost:3000` 选择 `codex-cli` 并启动任务；预期任务进入 `PENDING_REVIEW` 且显示翻译条目。

- [ ] **Step 6: Git 门禁与提交。**

仅暂存上述两个 Agents 文件与本计划文件；提交前检查暂存清单、体积、`git diff --check`、忽略规则，以及生成目录未被跟踪；不 push。
