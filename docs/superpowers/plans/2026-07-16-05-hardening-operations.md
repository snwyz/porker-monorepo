# Hardening and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish production-like security, observability, recovery, reconciliation, and release gates for the testnet MVP.

**Architecture:** Defense-in-depth is applied at HTTP, WebSocket, database, chain, container, and operator boundaries. Automated drills prove recovery rather than relying on written procedures alone.

**Tech Stack:** NestJS guards/interceptors, Redis rate limiting, structured JSON logs, OpenTelemetry-compatible metrics, PostgreSQL backup tools, Docker Compose, Playwright, Foundry.

## Global Constraints

- This release remains testnet-only and trusted-server; documentation must not imply mainnet or provable-fair readiness.
- Secrets, signatures, cookies, private cards, random seeds, and operator keys never enter logs.
- Liveness, dependency readiness, and chain-indexer lag are separate signals.
- Every release must pass points-mode exclusion and Web3 end-to-end tests.

---

### Task 1: Rate limits, typed errors, and log redaction

**Files:**
- Create: `apps/game-server/src/security/rate-limit.guard.ts`
- Create: `apps/game-server/src/security/redacting-logger.ts`
- Create: `apps/game-server/src/common/problem-details.filter.ts`
- Create: `apps/game-server/src/security/security.module.ts`
- Test: `apps/game-server/test/security.e2e-spec.ts`

**Interfaces:**
- Produces: stable problem codes, per-IP/session/wallet Redis buckets, redacted structured logs.

- [ ] **Step 1: Write failing abuse and redaction tests**

```ts
it('rate limits nonce creation without logging sensitive fields', async () => {
  for (let i = 0; i < 10; i += 1) await requestNonce().expect(i < 5 ? 201 : 429)
  const output = capturedLogs.join('\n')
  expect(output).not.toMatch(/privateKey|cookie|signature|holeCards|deckSeed/i)
})
```

- [ ] **Step 2: Implement layered buckets and allow-listed logging**

Use explicit DTO/log allow lists rather than recursive blacklists. Apply stricter buckets to auth, room creation, deposit, and withdrawal endpoints; reject socket floods before game command execution. Return `code`, `message`, `requestId`, and authoritative `version` where relevant.

- [ ] **Step 3: Verify and commit**

Run: `pnpm --filter @poker/game-server test:e2e -- security.e2e-spec.ts`
Expected: PASS for rate limits, reset behavior, Redis outage fail-safe policy, and redaction.

```bash
git add apps/game-server/src/security apps/game-server/src/common apps/game-server/test
git commit -m "security: add layered limits and safe structured errors"
```

### Task 2: Metrics, readiness, alerts, and reconciliation

**Files:**
- Create: `apps/game-server/src/observability/metrics.service.ts`
- Modify: `apps/game-server/src/health/health.controller.ts`
- Create: `apps/game-server/src/reconciliation/reconciliation.service.ts`
- Create: `deploy/alerts.example.yml`
- Test: `apps/game-server/test/reconciliation.integration-spec.ts`

**Interfaces:**
- Produces: metrics for action latency, event-loop lag, active tables, reconnects, ledger imbalance, indexer lag, and failed reconciliation.

- [ ] **Step 1: Write failing drift test**

```ts
it('detects ledger/deposit drift without mutating automatically', async () => {
  await insertSyntheticUncreditedDeposit()
  const report = await reconciliation.run({ repair: false })
  expect(report.anomalies).toContainEqual(expect.objectContaining({ code: 'UNPOSTED_CONFIRMED_DEPOSIT' }))
  expect(await escrowBalance(player)).toBe(0n)
})
```

- [ ] **Step 2: Implement read-only default reconciliation**

Compare confirmed deposit events, consumed withdrawal nonces, ledger transactions, active table chips, buy-in reservations, and cash-outs. Repair commands require an explicit anomaly ID and create an `AuditLog`; the scheduled job only reports.

- [ ] **Step 3: Add readiness thresholds and alert examples**

Readiness fails for database/Redis unavailability and excessive indexer lag in Web3 mode, but liveness remains process-only. Alert on any ledger imbalance, sustained p95 action acknowledgement above 250 ms, event-loop lag above 100 ms, failed backup, or indexer lag beyond the configured confirmation window.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @poker/game-server test:integration -- reconciliation.integration-spec.ts`
Expected: PASS for report-only, explicit repair, audit, and idempotent rerun.

```bash
git add apps/game-server/src/observability apps/game-server/src/health apps/game-server/src/reconciliation deploy/alerts.example.yml apps/game-server/test
git commit -m "ops: add observability and ledger reconciliation"
```

### Task 3: Backup, restore, process recovery, and indexer replay drills

**Files:**
- Create: `deploy/scripts/backup-postgres.sh`
- Create: `deploy/scripts/restore-postgres.sh`
- Create: `tests/drills/restart-recovery.sh`
- Create: `tests/drills/restore-recovery.sh`
- Create: `tests/drills/indexer-replay.sh`
- Create: `docs/operations/recovery-runbook.md`

**Interfaces:**
- Produces: encrypted timestamped backups and executable recovery drills.

- [ ] **Step 1: Write drill acceptance conditions**

The restart drill begins an active hand, kills the game-server container, restarts it, reconnects both clients, and verifies the same `handId`, version, stacks, and visible cards. The restore drill records ledger totals, restores a backup into a clean database, and compares every account total plus hand-event count. The replay drill resets the indexer checkpoint and proves unchanged credited balances.

- [ ] **Step 2: Implement fail-closed scripts**

Use `set -euo pipefail`, refuse restore without an empty target database plus explicit confirmation flag, encrypt production backups through an injected command/key, and emit machine-readable result summaries without secrets.

- [ ] **Step 3: Run drills and commit**

Run:

```bash
bash tests/drills/restart-recovery.sh
bash tests/drills/restore-recovery.sh
bash tests/drills/indexer-replay.sh
```

Expected: all scripts exit 0 and produce matching state/invariant reports.

```bash
git add deploy/scripts tests/drills docs/operations/recovery-runbook.md
git commit -m "ops: automate backup and recovery drills"
```

### Task 4: Final security and release gate

**Files:**
- Create: `docs/security/threat-model.md`
- Create: `docs/security/testnet-limitations.md`
- Create: `scripts/release-gate.sh`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm release:gate`, the single testnet release decision command.

- [ ] **Step 1: Document concrete assets, actors, and trust boundaries**

Cover malicious player, colluding players, compromised guest session, stolen operator key, RPC failure, chain reorg, database operator, denial of service, deck leakage, replayed action, replayed voucher, and container compromise. State plainly that server dealing is not provably fair and operator vouchers are custodial.

- [ ] **Step 2: Implement the gate**

```bash
#!/usr/bin/env bash
set -euo pipefail
pnpm lint
pnpm typecheck
pnpm test
APP_MODE=points pnpm --filter @poker/web build
APP_MODE=points pnpm --filter @poker/web test:e2e -- points-exclusion.spec.ts
APP_MODE=web3 pnpm --filter @poker/web build
APP_MODE=web3 pnpm --filter @poker/web test:e2e -- web3-flow.spec.ts
(cd packages/contracts && forge fmt --check && forge test -vvv)
bash tests/drills/restart-recovery.sh
bash tests/drills/indexer-replay.sh
```

- [ ] **Step 3: Run the complete gate and commit**

Run: `pnpm release:gate`
Expected: exit 0 with all Turbo, browser, contract, recovery, and mode-isolation checks passing.

```bash
git add docs/security scripts/release-gate.sh package.json
git commit -m "chore: add testnet security and release gate"
```
