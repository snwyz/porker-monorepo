# Agent Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable local agent runtime that selects Codex CLI first, can safely fall back to configured providers, and produces validated translation-review jobs.

**Architecture:** `packages/agents` defines provider-independent request/result types and a runner. Provider adapters never expose secrets; translation is a structured agent built on the runner and writes a proposed job only, never a production dictionary.

**Tech Stack:** TypeScript, Node.js child processes, fetch, Zod, Vitest.

## Global Constraints

- Provider mode `auto` probes Codex CLI first; fallbacks require explicit configuration/approval.
- Supported adapters: Codex CLI, Anthropic, Gemini and OpenAI-compatible HTTP.
- Tests use fake transports/providers and make no external request.
- The package never reads keys from files or logs raw prompts/responses.

---

### Task 1: Define agent, provider, job and configuration contracts

**Files:**
- Create: `packages/agents/package.json`, `packages/agents/tsconfig.json`
- Create: `packages/agents/src/index.ts`, `packages/agents/src/core/agent.ts`, `packages/agents/src/core/provider.ts`, `packages/agents/src/core/config.ts`, `packages/agents/src/core/runner.ts`
- Create: `packages/agents/src/core/runner.test.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export type ProviderId = "codex-cli" | "anthropic" | "gemini" | "openai-compatible";
export type AgentRequest = { prompt: string; schema: z.ZodType; provider?: ProviderId | "auto" };
export type AgentResult<T> = { provider: ProviderId; model: string; value: T; fallbackReason?: string };
export type AgentConfig = { providerOrder: ProviderId[]; allowPaidFallback: boolean; models: Partial<Record<ProviderId, string>> };
```

- [ ] **Step 1: Write failing provider-choice tests.**

```ts
expect(await runner.run(request)).toMatchObject({ provider: "codex-cli" });
expect(await runner.run(request)).toMatchObject({ provider: "anthropic", fallbackReason: "codex-cli unavailable" });
await expect(disallowPaid.run(request)).rejects.toThrow("Paid fallback requires approval");
```

- [ ] **Step 2: Run the focused test and verify failure.**

Run: `pnpm --filter @poker/agents test -- runner.test.ts`

Expected: failure because the package does not exist.

- [ ] **Step 3: Implement schemas, selection and safe reports.**

Validate config with Zod. Probe Codex through an injected availability function; select the first configured available adapter. A forced provider bypasses probing but fails if unavailable. Return only provider/model/fallback reason/duration/status in reports; redact authorization headers and never serialize prompt/result text into reports.

- [ ] **Step 4: Verify contract behavior.**

Run: `pnpm --filter @poker/agents test && pnpm --filter @poker/agents typecheck && pnpm --filter @poker/agents lint`

Expected: unit tests prove Codex preference, explicit paid-fallback gate, forced selection and schema rejection.

### Task 2: Implement provider adapters and CLI entry point

**Files:**
- Create: `packages/agents/src/providers/codex-cli.ts`, `packages/agents/src/providers/anthropic.ts`, `packages/agents/src/providers/gemini.ts`, `packages/agents/src/providers/openai-compatible.ts`, `packages/agents/src/providers/index.ts`
- Create: `packages/agents/src/providers/providers.test.ts`, `packages/agents/src/cli.ts`

**Interfaces:**
- Consumes `Provider` from Task 1.
- Produces `pnpm --filter @poker/agents agents run translation --provider auto --input <path>`.

- [ ] **Step 1: Write fake-transport adapter tests.**

```ts
expect(await codex.isAvailable()).toBe(true);
await expect(anthropic.complete(request)).resolves.toEqual(expect.objectContaining({ text: "{}" }));
expect(fakeFetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ headers: expect.not.objectContaining({ authorization: expect.stringMatching(/console/) }) }));
```

- [ ] **Step 2: Run adapter tests and verify failure.**

Run: `pnpm --filter @poker/agents test -- providers.test.ts`

Expected: failure because adapters are absent.

- [ ] **Step 3: Implement injected execution/HTTP adapters.**

Codex adapter invokes only a configured local executable with inherited authenticated environment. HTTP adapters obtain their key only from the configured environment-variable name and use injected `fetch` in tests. The OpenAI-compatible adapter validates an HTTPS base URL outside tests. The CLI prints selected provider/model and item count, requests confirmation before a paid fallback unless `--approve-paid-fallback` is present, and writes its result only to an explicit output path.

- [ ] **Step 4: Verify offline.**

Run: `pnpm --filter @poker/agents test && pnpm --filter @poker/agents typecheck`

Expected: all adapters are tested without an API key or network request.

### Task 3: Add the translation agent and job schema

**Files:**
- Create: `packages/agents/src/agents/translation/index.ts`, `packages/agents/src/agents/translation/prompt.ts`, `packages/agents/src/agents/translation/schema.ts`, `packages/agents/src/agents/translation/validate.ts`, `packages/agents/src/agents/translation/translation.test.ts`
- Modify: `packages/agents/src/index.ts`, `packages/agents/src/cli.ts`

**Interfaces:**

```ts
export type TranslationEntry = { code: `P${number}`; en: string; params: number[]; sources: string[] };
export type TranslationProposal = TranslationEntry & { "zh-CN": string };
export type TranslationJob = { id: string; status: "PENDING_REVIEW"; proposals: TranslationProposal[]; provider: ProviderId; model: string };
```

- [ ] **Step 1: Write failing proposal-validation tests.**

```ts
expect(validateProposal({ code: "P00042", en: "{0} seconds remaining", "zh-CN": "剩余 {0} 秒", params: [0] })).toBeDefined();
expect(() => validateProposal({ code: "P00042", en: "{0}", "zh-CN": "完成", params: [0] })).toThrow("placeholder mismatch");
```

- [ ] **Step 2: Run and verify failure.**

Run: `pnpm --filter @poker/agents test -- translation.test.ts`

Expected: failure because translation schemas are absent.

- [ ] **Step 3: Implement deterministic prompt and validator.**

Prompt the provider to preserve each code and every positional token exactly, return JSON matching the Zod schema, and not add commentary. Reject missing, extra, duplicate or reordered code records; reject template parameter mismatch; create a `PENDING_REVIEW` job only after validation.

- [ ] **Step 4: Verify and request commit authorization.**

Run: `pnpm --filter @poker/agents test && pnpm --filter @poker/agents typecheck && git diff --check`

Expected: valid mock output becomes a review job; invalid output does not create one. Before any commit, request approval and inspect staged paths/size/ignored outputs.
