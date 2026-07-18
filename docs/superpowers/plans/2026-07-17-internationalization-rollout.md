# Internationalization Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver bilingual product copy, provider-independent translation jobs, and a visual approval workflow without exposing model credentials or unreviewed translations.

**Architecture:** Implement three independently testable packages/apps in order: the shared i18n foundation, the reusable agent runtime, then the TMS frontend/API pair. `apps/tms-api` is the sole publisher of approved dictionaries; production clients only consume `packages/i18n`.

**Tech Stack:** TypeScript, Next.js 16/React 19, NestJS 11, Zod, Vitest, pnpm workspaces.

## Global Constraints

- Locales are exactly `en` and `zh-CN`; fallback locale is `en`.
- Every user-visible message uses a stable `P00001`-style key and positional `{0}`…`{n}` placeholders.
- Catalog count excludes test files and `apps/poker-web/src/app/test-harness`.
- Agent default provider selection is Codex CLI first, then configured paid fallbacks only after explicit approval/configuration.
- Keys, raw model responses, generated task files, and credentials are never committed.
- `apps/tms-web` and `apps/tms-api` are local/internal-only while no authentication exists.
- Do not push, tag, merge, deploy, or commit without the user's separate authorization and Git safety gate.

---

## Execution order

1. [i18n foundation](2026-07-17-i18n-foundation.md): audit, message catalog, Web integration, and game-server error-code transport.
2. [agent platform](2026-07-17-agent-platform.md): provider abstraction, auto-selection, and structured translation job output.
3. [TMS review](2026-07-17-tms-review.md): start/review/approve workflow and atomic dictionary publishing.

The TMS plan starts only after both preceding plans are green. A real provider translation is a separately confirmed, potentially paid operation; mock-provider tests are the default verification path.
