# TMS Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a local visual review surface that starts translation jobs through a separate API and atomically publishes only approved Chinese entries.

**Architecture:** `apps/tms-web` is a single-route Next.js client. `apps/tms-api` is a NestJS internal service that owns job persistence, agent execution and approval; it is the only code path allowed to update `packages/i18n/src/locales/zh-CN.json` and `catalog.json`.

**Tech Stack:** Next.js 16, React 19, NestJS 11, Zod, Vitest, filesystem atomic rename.

## Global Constraints

- TMS and TMS API bind to loopback by default and must not expose a public deployment without later authentication work.
- `TMS_DATA_DIR` is required and must be outside the repository; task outputs are never committed.
- TMS does not receive provider credentials; only TMS API loads agent configuration.
- Approval validates a job snapshot before atomically replacing both reviewed dictionary and catalog files.

---

### Task 1: Scaffold the local TMS API and durable job store

**Files:**
- Create: `apps/tms-api/package.json`, `apps/tms-api/tsconfig.json`, `apps/tms-api/eslint.config.js`
- Create: `apps/tms-api/src/main.ts`, `apps/tms-api/src/app.module.ts`
- Create: `apps/tms-api/src/jobs/job.schema.ts`, `apps/tms-api/src/jobs/job.repository.ts`, `apps/tms-api/src/jobs/jobs.service.ts`, `apps/tms-api/src/jobs/jobs.controller.ts`
- Create: `apps/tms-api/test/jobs.e2e-spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `POST /v1/jobs`, `GET /v1/jobs`, `GET /v1/jobs/:id`; all payloads validate with Zod.
- A job is persisted as `<TMS_DATA_DIR>/jobs/<uuid>.json` via write-temp-and-rename.

- [ ] **Step 1: Write failing API persistence tests.**

```ts
const created = await request(app).post("/v1/jobs").send({ provider: "auto", codes: ["P00042"] }).expect(201);
expect(created.body.status).toBe("QUEUED");
expect(await request(app).get(`/v1/jobs/${created.body.id}`).expect(200)).toMatchObject({ id: created.body.id });
```

- [ ] **Step 2: Run and verify failure.**

Run: `pnpm --filter @poker/tms-api test -- jobs.e2e-spec.ts`

Expected: failure because the TMS API package is absent.

- [ ] **Step 3: Implement loopback bootstrap and atomic job repository.**

Reject startup without an absolute `TMS_DATA_DIR`; create only its `jobs` child directory. Bind `HOST` default to `127.0.0.1`. Job requests choose a provider mode but do not contain a secret. Repository uses a sibling temporary file and `rename` to make each job snapshot atomic.

- [ ] **Step 4: Verify local API.**

Run: `pnpm --filter @poker/tms-api test && pnpm --filter @poker/tms-api typecheck && pnpm --filter @poker/tms-api lint`

Expected: jobs survive service restart when the same external data directory is supplied.

### Task 2: Add translation execution and approval publishing endpoints

**Files:**
- Create: `apps/tms-api/src/translations/translations.service.ts`, `apps/tms-api/src/approvals/approval.schema.ts`, `apps/tms-api/src/approvals/approval.service.ts`, `apps/tms-api/src/approvals/approval.controller.ts`
- Create: `apps/tms-api/test/approval.e2e-spec.ts`
- Modify: `apps/tms-api/src/app.module.ts`, `apps/tms-api/src/jobs/jobs.service.ts`

**Interfaces:**
- Consumes `translateCatalog` from `@poker/agents` and i18n catalog validation from `@poker/i18n`.
- Produces `POST /v1/jobs/:id/run`, `PATCH /v1/jobs/:id/proposals/:code`, and `POST /v1/jobs/:id/approve`.

- [ ] **Step 1: Write failing run/edit/approve tests using a fake agent.**

```ts
await request(app).post(`/v1/jobs/${job.id}/run`).expect(202);
await request(app).patch(`/v1/jobs/${job.id}/proposals/P00042`).send({ "zh-CN": "剩余 {0} 秒", decision: "APPROVED" }).expect(200);
await request(app).post(`/v1/jobs/${job.id}/approve`).expect(200);
expect(readDictionary()["P00042"]).toBe("剩余 {0} 秒");
```

- [ ] **Step 2: Run and verify failure.**

Run: `pnpm --filter @poker/tms-api test -- approval.e2e-spec.ts`

Expected: failure because execution and publishing endpoints are absent.

- [ ] **Step 3: Implement task execution, review edits and transactional publish.**

Load only catalog codes selected for the job. Use `@poker/agents` to create `PENDING_REVIEW` proposals. Permit a reviewer to edit Chinese text before marking an entry approved. Refuse approval unless every job entry is approved and all `{n}` sets match the English template. Write validated new JSON to sibling temp files, fsync them, then rename both files; leave the job as `PUBLISH_FAILED` if either write fails and retain the original dictionaries.

- [ ] **Step 4: Verify publish safety.**

Run: `pnpm --filter @poker/tms-api test && pnpm --filter @poker/tms-api typecheck`

Expected: valid approved jobs update both files; a bad placeholder or simulated write failure leaves both original files unchanged.

### Task 3: Build the single-route TMS reviewer

**Files:**
- Create: `apps/tms-web/package.json`, `apps/tms-web/tsconfig.json`, `apps/tms-web/next.config.ts`, `apps/tms-web/app/layout.tsx`, `apps/tms-web/app/page.tsx`, `apps/tms-web/app/globals.css`
- Create: `apps/tms-web/src/lib/tms-api.ts`, `apps/tms-web/src/features/review/review-page.tsx`, `apps/tms-web/src/features/review/review-row.tsx`, `apps/tms-web/src/features/review/review-page.test.tsx`
- Modify: `package.json`, `pnpm-workspace.yaml`

**Interfaces:**
- Consumes only TMS API URLs and typed public job payloads.
- Produces the one visible route `/`, with job selection, provider selection, start, filters, Chinese editing, per-entry decision and final approval.

- [ ] **Step 1: Write failing reviewer interaction tests.**

```tsx
render(<ReviewPage api={fakeApi} />);
await user.selectOptions(screen.getByLabelText("Provider"), "auto");
await user.click(screen.getByRole("button", { name: "Start translation" }));
expect(await screen.findByText("P00042")).toBeVisible();
await user.clear(screen.getByLabelText("Chinese for P00042"));
await user.type(screen.getByLabelText("Chinese for P00042"), "剩余 {0} 秒");
```

- [ ] **Step 2: Run and verify failure.**

Run: `pnpm --filter @poker/tms test -- review-page.test.tsx`

Expected: failure because the TMS app does not exist.

- [ ] **Step 3: Implement the review page.**

Render each proposal with code, English baseline, Chinese editable text, placeholder list, source locations, provider/model and decision. Support filtering by pending/approved/rejected and validation failures. Disable final approval until all visible job entries are approved and show the exact count that will be published. Display the API's paid-provider confirmation requirement rather than exposing credentials.

- [ ] **Step 4: Verify the UI and local build.**

Run: `pnpm --filter @poker/tms test && pnpm --filter @poker/tms typecheck && pnpm --filter @poker/tms lint && pnpm --filter @poker/tms build`

Expected: one route builds, reviewer keyboard labels work, and no API key is shipped in the browser bundle.

- [ ] **Step 5: Request commit authorization and run the Git gate before committing.**

Run after approval: `git status --short && git diff --check && git diff --cached --name-only && git diff --cached --stat`

Expected: only TMS source/configuration/tests are staged; no external `TMS_DATA_DIR` files, keys or dictionary task output is staged.
