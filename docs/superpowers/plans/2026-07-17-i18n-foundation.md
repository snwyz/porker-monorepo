# i18n Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production Web and game-server messages resolvable from a shared English/Simplified-Chinese `P`-key catalog.

**Architecture:** `packages/i18n` owns typed dictionaries, `{n}` template formatting, locale normalization and catalog validation. Web provides the selected locale to React and Socket.IO; game-server emits codes plus positional parameters instead of display strings.

**Tech Stack:** TypeScript, Zod, Vitest, Next.js App Router, NestJS, Socket.IO.

## Global Constraints

- Use `t(code, params?)`, such as `t("P00042", { 0: seconds })`; never use source text as a key.
- Do not include test or test-harness copy in catalog counts.
- Do not modify or read generated/ignored artifacts.
- No real translation-model request is part of this plan.

---

### Task 1: Establish the shared catalog contract and audit tool

**Files:**
- Create: `packages/i18n/package.json`, `packages/i18n/tsconfig.json`
- Create: `packages/i18n/src/index.ts`, `packages/i18n/src/locale.ts`, `packages/i18n/src/messages.ts`, `packages/i18n/src/translate.ts`
- Create: `packages/i18n/src/catalog.json`, `packages/i18n/src/locales/en.json`, `packages/i18n/src/locales/zh-CN.json`
- Create: `packages/i18n/src/translate.test.ts`, `packages/i18n/scripts/extract-catalog.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `Locale = "en" | "zh-CN"`, `MessageCode = \`P${number}\``, `MessageParams = Record<number, string | number>`, `t(locale, code, params?)` and `validateCatalog(catalog, dictionaries)`.
- Consumes no provider or UI code.

- [ ] **Step 1: Write failing formatter and locale tests.**

```ts
expect(t("en", "P00042", { 0: 15 })).toBe("15 seconds remaining");
expect(t("zh-CN", "P00042", { 0: 15 })).toBe("剩余 15 秒");
expect(() => t("en", "P00042", {})).toThrow("P00042 requires {0}");
expect(normalizeLocale("zh-CN,zh;q=0.9")).toBe("zh-CN");
```

- [ ] **Step 2: Run the focused test and verify failure.**

Run: `pnpm --filter @poker/i18n test -- translate.test.ts`

Expected: failure because the i18n package and exports do not exist.

- [ ] **Step 3: Implement the minimal shared contract.**

```ts
export function t(locale: Locale, code: MessageCode, params: MessageParams = {}) {
  const template = dictionaries[locale][code];
  if (!template) throw new Error(`Unknown message code: ${code}`);
  return template.replace(/\{(\d+)\}/g, (token, index) => {
    const value = params[Number(index)];
    if (value === undefined) throw new Error(`${code} requires ${token}`);
    return String(value);
  });
}
```

Implement `extract-catalog.ts` to scan only tracked source under `apps/web/src` (excluding test and test-harness paths) and `apps/game-server/src`, output candidate source locations, and refuse to assign duplicate `P` codes. The reviewer assigns the initial sequential codes once, then the tool validates rather than renumbers existing codes.

- [ ] **Step 4: Run validation and record the authoritative count.**

Run: `pnpm --filter @poker/i18n test && pnpm --filter @poker/i18n extract-catalog`

Expected: tests pass; command prints the count of unique catalog entries and writes no generated files outside explicitly reviewed catalog/dictionaries.

- [ ] **Step 5: Request commit authorization and run the Git gate before committing.**

Run after approval: `git status --short && git diff --check && git diff --cached --name-only && git diff --cached --stat`

Expected: staged files are only i18n source/tests/configuration; no `dist`, cache, secret, log, database, or generated task output is staged.

### Task 2: Integrate selected locale into the Web app

**Files:**
- Create: `apps/web/src/i18n/provider.tsx`, `apps/web/src/i18n/locale-cookie.ts`, `apps/web/src/i18n/locale-switcher.tsx`, `apps/web/src/i18n/provider.test.tsx`
- Modify: `apps/web/package.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/modes/points-entry.tsx`
- Modify after catalog audit: all production-copy owners in `apps/web/src/app`, `apps/web/src/components/poker`, `apps/web/src/features`, and `apps/web/src/modes`

**Interfaces:**
- Consumes `@poker/i18n` `Locale`, `normalizeLocale`, and formatter.
- Produces `useI18n(): { locale: Locale; setLocale(locale: Locale): void; t(code: MessageCode, params?: MessageParams): string }`.

- [ ] **Step 1: Write failing provider tests.**

```tsx
render(<I18nProvider initialLocale="zh-CN"><Example /></I18nProvider>);
expect(screen.getByRole("button", { name: "弃牌" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "EN" }));
expect(screen.getByRole("button", { name: "Fold" })).toBeVisible();
expect(document.cookie).toContain("poker_locale=en");
```

- [ ] **Step 2: Run the focused Web test and verify failure.**

Run: `pnpm --filter @poker/web test -- provider.test.tsx`

Expected: failure because `I18nProvider` is absent.

- [ ] **Step 3: Implement provider, cookie priority, and language switcher.**

Use cookie `poker_locale`; select cookie first, then `navigator.languages`, then `en`. Wrap `RootLayout` with the provider, set `<html lang>` from the selected locale, and render the switcher in `PointsPage`. Convert literal UI and accessibility messages only after a catalog entry exists, including `aria-label`, `sr-only`, button labels, empty states and templates.

- [ ] **Step 4: Update all audited Web copy and test both languages.**

Run: `pnpm --filter @poker/web test && pnpm --filter @poker/web typecheck && pnpm --filter @poker/web lint`

Expected: no production UI literal remains except catalog-approved non-translatable names, routes, CSS classes, protocol values, or test IDs; tests pass in both initial locales.

- [ ] **Step 5: Request commit authorization and run the Git gate before committing.**

Run after approval: `git status --short && git diff --check && git diff --cached --name-only && git diff --cached --stat`

Expected: staged set contains only reviewed Web/i18n source and tests.

### Task 3: Transport locale and stable errors through game-server

**Files:**
- Create: `apps/game-server/src/i18n/locale-from-request.ts`, `apps/game-server/src/i18n/message-code.ts`, `apps/game-server/src/i18n/i18n.module.ts`, `apps/game-server/test/i18n.e2e-spec.ts`
- Modify: `apps/game-server/package.json`, `apps/game-server/src/app.module.ts`, `apps/game-server/src/game/game.gateway.ts`
- Modify: user-facing error producers in `apps/game-server/src/identity`, `apps/game-server/src/rooms`, `apps/game-server/src/settlement`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/lib/socket.ts`, and their tests

**Interfaces:**
- Produces `LocalizedProblem = { code: MessageCode; params?: Record<number, string | number> }`.
- Socket handshake reads `poker_locale`; HTTP reads the same cookie or `Accept-Language`.

- [ ] **Step 1: Write failing HTTP and Socket error tests.**

```ts
expect(response.body).toEqual({ code: "P00101", params: { 0: "nickname" } });
socket.io.opts.extraHeaders = { Cookie: "poker_locale=zh-CN" };
expect(await emitAck(socket, "table:join", invalid)).toMatchObject({ ok: false, code: "P00102" });
```

- [ ] **Step 2: Run the focused server test and verify failure.**

Run: `pnpm --filter @poker/game-server test:e2e -- i18n.e2e-spec.ts`

Expected: failure because legacy message payloads are still emitted.

- [ ] **Step 3: Replace display strings with codes and parameters.**

Map only errors that cross HTTP/WebSocket boundaries to catalog codes. Preserve internal configuration errors and logs as non-display diagnostics. Update Web request/socket clients to parse `code`/`params` and format via the current locale instead of JSON-stringifying server messages.

- [ ] **Step 4: Verify integration.**

Run: `pnpm --filter @poker/game-server test:e2e -- i18n.e2e-spec.ts && pnpm --filter @poker/web test -- api.test.ts socket.test.ts && pnpm typecheck`

Expected: stable code payloads are asserted, Web formats both locales, and workspace typecheck passes.

- [ ] **Step 5: Request commit authorization and run the Git gate before committing.**

Run after approval: `git status --short && git diff --check && git diff --cached --name-only && git diff --cached --stat`

Expected: no build outputs, credentials, catalog task results, or generated directories are staged.
