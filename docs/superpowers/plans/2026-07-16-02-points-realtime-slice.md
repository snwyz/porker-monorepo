# Points-Mode Real-Time Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let guests create public rooms, buy in with entertainment points, complete hands through Socket.IO, reconnect, leave, and receive exact settlement.

**Architecture:** NestJS owns HTTP/WebSocket orchestration, PostgreSQL owns durable sessions/events/ledger entries, Redis owns transient presence and snapshots, and `@poker/engine` remains the only game-rules implementation.

**Tech Stack:** NestJS, Socket.IO, Prisma, PostgreSQL, Redis/ioredis, Zod, Vitest/Jest, Testcontainers, Next.js latest stable.

## Global Constraints

- Run with `APP_MODE=points`; points are non-transferable, non-purchasable, and non-withdrawable.
- Public rooms only; 2–9 seats; cash games only.
- Every balance change uses balanced double-entry postings with a unique business reference.
- Every action uses `actionId` and `expectedVersion`; retries are idempotent.

---

### Task 1: Database package and balanced ledger

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/ledger.ts`
- Test: `packages/db/src/ledger.integration.test.ts`
- Create: `compose.test.yml`

**Interfaces:**
- Produces: `postTransaction(input)`, `getBalance(accountId)`, `reserveBuyIn(input)`, `settleCashOut(input)`.

- [ ] **Step 1: Write a failing integration test against disposable PostgreSQL**

```ts
it('posts a balanced grant once', async () => {
  await postTransaction({ reference: 'grant:user-1', entries: [
    { accountId: 'points:treasury', amount: -10000n },
    { accountId: 'points:user-1', amount: 10000n },
  ] })
  await postTransaction({ reference: 'grant:user-1', entries: [
    { accountId: 'points:treasury', amount: -10000n },
    { accountId: 'points:user-1', amount: 10000n },
  ] })
  expect(await getBalance('points:user-1')).toBe(10000n)
})
```

- [ ] **Step 2: Verify failure**

Run: `docker compose -f compose.test.yml up -d postgres && pnpm --filter @poker/db test`
Expected: FAIL because schema and repository are absent.

- [ ] **Step 3: Implement schema and transaction invariant**

Create `User`, `Session`, `Room`, `Seat`, `Hand`, `HandEvent`, `GameSnapshot`, `LedgerAccount`, `LedgerTransaction`, `LedgerEntry`, and `AuditLog`. Store money/chips as `BigInt`. Give `LedgerTransaction.reference` a unique index.

```ts
if (input.entries.reduce((sum, entry) => sum + entry.amount, 0n) !== 0n) {
  throw new Error('UNBALANCED_TRANSACTION')
}
```

Insert the transaction and all entries in one serializable Prisma transaction; on unique-reference conflict, read and return the original transaction.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @poker/db prisma migrate dev --name init && pnpm --filter @poker/db test`
Expected: PASS, including concurrent duplicate-reference tests.

```bash
git add packages/db compose.test.yml
git commit -m "feat(db): add durable schema and double-entry ledger"
```

### Task 2: Points-mode game server, guest identity, and room API

**Files:**
- Create: `apps/poker-api/package.json`
- Create: `apps/poker-api/src/main.ts`
- Create: `apps/poker-api/src/app.module.ts`
- Create: `apps/poker-api/src/config/app-mode.ts`
- Create: `apps/poker-api/src/identity/guest.controller.ts`
- Create: `apps/poker-api/src/identity/guest.service.ts`
- Create: `apps/poker-api/src/rooms/rooms.controller.ts`
- Create: `apps/poker-api/src/rooms/rooms.service.ts`
- Test: `apps/poker-api/test/points-api.e2e-spec.ts`

**Interfaces:**
- Produces: `POST /v1/guest-session`, `GET/POST /v1/rooms`, `GET /v1/capabilities`.

- [ ] **Step 1: Write failing HTTP acceptance tests**

```ts
it('creates one guest and grants points exactly once', async () => {
  const response = await request(app.getHttpServer()).post('/v1/guest-session').send({ nickname: 'RiverFox' }).expect(201)
  expect(response.headers['set-cookie'][0]).toContain('poker_session=')
  expect(response.body).toMatchObject({ nickname: 'RiverFox', points: '10000' })
})
```

- [ ] **Step 2: Verify failure**

Run: `APP_MODE=points pnpm --filter @poker/game-server test:e2e -- points-api.e2e-spec.ts`
Expected: FAIL because the app is absent.

- [ ] **Step 3: Scaffold NestJS and implement points identity**

Validate `APP_MODE` with Zod, hash opaque session tokens before persistence, set `HttpOnly`, `Secure`, `SameSite=Lax` cookies, enforce nickname length/character rules, and post the initial points grant using reference `guest-grant:<userId>`.

Room creation accepts `{ name, seats, smallBlind, bigBlind, minBuyIn, maxBuyIn, actionTimeoutSeconds }`; validate `2 <= seats <= 9`, `smallBlind < bigBlind`, and `bigBlind <= minBuyIn <= maxBuyIn`.

- [ ] **Step 4: Verify and commit**

Run: `APP_MODE=points pnpm --filter @poker/game-server test:e2e`
Expected: PASS for session reuse, duplicate nickname rejection, invalid mode startup, and room validation.

```bash
git add apps/poker-api packages/shared packages/db
git commit -m "feat(server): add guest sessions and public room API"
```

### Task 3: Socket.IO table ownership, action idempotency, and recovery

**Files:**
- Create: `apps/poker-api/src/game/game.gateway.ts`
- Create: `apps/poker-api/src/game/table-runtime.ts`
- Create: `apps/poker-api/src/game/table-repository.ts`
- Create: `apps/poker-api/src/game/deck.ts`
- Create: `apps/poker-api/src/game/recovery.service.ts`
- Test: `apps/poker-api/test/game-socket.e2e-spec.ts`

**Interfaces:**
- Consumes: `@poker/engine` reducer and `@poker/shared` schemas.
- Produces: socket events `table:join`, `table:action`, `table:snapshot`, `table:event`, `table:error`, `table:leave`.

- [ ] **Step 1: Write a failing two-client socket test**

```ts
it('applies a repeated actionId once and resends the original result', async () => {
  const action = { roomId, handId, actionId: 'same-id', expectedVersion: 3, type: 'call' }
  const first = await emitAck(player, 'table:action', action)
  const repeated = await emitAck(player, 'table:action', action)
  expect(repeated).toEqual(first)
  expect((await eventsFor(handId)).filter(e => e.actionId === 'same-id')).toHaveLength(1)
})
```

- [ ] **Step 2: Verify failure**

Run: `APP_MODE=points pnpm --filter @poker/game-server test:e2e -- game-socket.e2e-spec.ts`
Expected: FAIL because the gateway does not exist.

- [ ] **Step 3: Implement authoritative action commit**

Within a table mutex: load current version, validate the command, call the engine, append events and updated snapshot in one database transaction, then broadcast only after commit. Generate the deck with `crypto.randomInt`-driven Fisher–Yates and encrypt the seed/full deck with an injected audit key.

```ts
const existing = await repository.findAction(action.actionId)
if (existing) return existing.ack
if (action.expectedVersion !== runtime.state.version) return { ok: false, code: 'STALE_VERSION', version: runtime.state.version }
```

- [ ] **Step 4: Add reconnect and restart tests**

Test missing-event replay, snapshot fallback, auto-check/auto-fold, seat grace period, process-style runtime reconstruction, and `draining` fallback when an event chain fails validation.

Run: `APP_MODE=points pnpm --filter @poker/game-server test:e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/poker-api/src/game apps/poker-api/test
git commit -m "feat(server): add authoritative realtime tables and recovery"
```

### Task 4: Functional Next.js points client

**Files:**
- Create: `apps/poker-web/` using `create-next-app`
- Create: `apps/poker-web/src/lib/api.ts`
- Create: `apps/poker-web/src/lib/socket.ts`
- Create: `apps/poker-web/src/features/guest/guest-entry.tsx`
- Create: `apps/poker-web/src/features/lobby/room-list.tsx`
- Create: `apps/poker-web/src/features/rooms/create-room-form.tsx`
- Create: `apps/poker-web/src/features/table/table-client.tsx`
- Create: `apps/poker-web/src/app/lobby/page.tsx`
- Create: `apps/poker-web/src/app/rooms/new/page.tsx`
- Create: `apps/poker-web/src/app/table/[roomId]/page.tsx`
- Test: `apps/poker-web/e2e/points-flow.spec.ts`

**Interfaces:**
- Consumes: points HTTP and socket APIs from Tasks 2–3.

- [ ] **Step 1: Scaffold latest stable Next.js and write the failing browser flow**

Run:

```bash
npx create-next-app@latest apps/poker-web --typescript --tailwind --eslint --app --src-dir --use-pnpm
pnpm --filter @poker/web add socket.io-client zod @tanstack/react-query
pnpm --filter @poker/web add -D @playwright/test
```

```ts
test('guest creates, joins, plays, and cashes out', async ({ browser }) => {
  const owner = await browser.newPage()
  const guest = await browser.newPage()
  await enterAs(owner, 'RiverFox')
  const roomId = await createRoom(owner, { seats: 2, blinds: '5/10', buyIn: 500 })
  await enterAs(guest, 'TurnCard')
  await joinHeadsUp(owner, guest, roomId)
  await completeOneHand(owner, guest)
  await leaveTable(owner)
  await expect(owner.getByTestId('points-balance')).toContainText(/\d+/)
})
```

- [ ] **Step 2: Verify failure**

Run: `APP_MODE=points pnpm --filter @poker/web test:e2e -- points-flow.spec.ts`
Expected: FAIL at the first missing page/selector.

- [ ] **Step 3: Implement the minimal functional pages**

Render server snapshots, legal actions, current bet, pot, seats, and cards without final visual polish. Disable actions until the server acknowledges the previous action. On `STALE_VERSION`, request a fresh snapshot and show a non-destructive resync message.

- [ ] **Step 4: Verify the vertical slice and commit**

Run: `APP_MODE=points pnpm test && APP_MODE=points pnpm typecheck && APP_MODE=points pnpm --filter @poker/web test:e2e`
Expected: all unit, integration, and browser tests pass.

```bash
git add apps/poker-web pnpm-lock.yaml package.json
git commit -m "feat(web): complete points-mode playable vertical slice"
```
