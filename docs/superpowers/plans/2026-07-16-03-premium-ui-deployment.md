# Premium UI and Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the functional client with the approved premium card-room UI, verify responsive accessibility, and deploy the points stack through Docker Compose and Caddy.

**Architecture:** Radix primitives and shadcn-style local components form the accessible base; poker domain components remain custom and render the authoritative table view model. Containers share a private network and only Caddy exposes HTTP(S).

**Tech Stack:** Tailwind CSS, Radix UI, CVA, React Hook Form, Zod, Lucide, Motion, Storybook, Playwright, Docker Compose, Caddy, Artillery Socket.IO engine.

## Global Constraints

- Palette: `#0D1210`, `#151B18`, `#0F6A4E`, `#3A2A20`, `#D6B262`, `#F4EAD6`, `#9BA89F`, `#C95D5D`.
- Desktop >=1024 px, tablet 768–1023 px, mobile <768 px.
- Mobile remains functional at nine seats; 2–6 seats is the comfortable target.
- Motion respects `prefers-reduced-motion`; state is never communicated by color alone.

---

### Task 1: Theme tokens and accessible primitives

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Create: `apps/web/src/lib/cn.ts`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/dialog.tsx`
- Create: `apps/web/src/components/ui/sheet.tsx`
- Create: `apps/web/src/components/ui/slider.tsx`
- Create: `apps/web/src/components/ui/toast.tsx`
- Test: `apps/web/src/components/ui/button.test.tsx`

**Interfaces:**
- Produces: local `Button`, `Dialog`, `Sheet`, `Slider`, and toast APIs; no Material UI dependency.

- [ ] **Step 1: Install primitives and write a failing keyboard test**

Run: `pnpm --filter @poker/web add @radix-ui/react-dialog @radix-ui/react-slider class-variance-authority clsx tailwind-merge lucide-react motion react-hook-form`.

```tsx
it('returns focus to the trigger when dialog closes', async () => {
  render(<ExampleDepositDialog />)
  await user.click(screen.getByRole('button', { name: 'Open' }))
  await user.keyboard('{Escape}')
  expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @poker/web test -- button.test.tsx`
Expected: FAIL before local primitives exist.

- [ ] **Step 3: Implement tokens and variants**

Define semantic CSS variables for background, surface, felt, walnut, primary, text, muted, and destructive colors. Implement button variants `primary`, `secondary`, `ghost`, and `destructive`; expose loading and disabled states with text and icons.

- [ ] **Step 4: Run accessibility checks and commit**

Run: `pnpm --filter @poker/web test && pnpm --filter @poker/web typecheck`
Expected: PASS for focus, label, disabled, and keyboard tests.

```bash
git add apps/web/src/app/globals.css apps/web/src/lib apps/web/src/components/ui pnpm-lock.yaml
git commit -m "feat(ui): add premium theme and accessible primitives"
```

### Task 2: Poker domain components and responsive table

**Files:**
- Create: `apps/web/src/components/poker/playing-card.tsx`
- Create: `apps/web/src/components/poker/player-seat.tsx`
- Create: `apps/web/src/components/poker/poker-table.tsx`
- Create: `apps/web/src/components/poker/community-cards.tsx`
- Create: `apps/web/src/components/poker/pot-display.tsx`
- Create: `apps/web/src/components/poker/action-panel.tsx`
- Create: `apps/web/src/components/poker/turn-timer.tsx`
- Create: `apps/web/src/components/poker/hand-history.tsx`
- Test: `apps/web/src/components/poker/poker-table.test.tsx`
- Test: `apps/web/e2e/responsive-table.spec.ts`

**Interfaces:**
- Consumes: a serializable `TableViewModel`; emits typed action intents without mutating state.

- [ ] **Step 1: Write failing semantic and responsive tests**

```tsx
it('labels cards and active player without color-only meaning', () => {
  render(<PokerTable table={fixture} onAction={vi.fn()} />)
  expect(screen.getByLabelText('Ace of spades')).toBeVisible()
  expect(screen.getByText('Your turn')).toBeVisible()
})
```

Playwright captures 1440×900, 834×1112, 390×844, and 844×390 layouts and asserts that the action panel remains inside the viewport.

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @poker/web test -- poker-table.test.tsx`
Expected: FAIL because domain components are missing.

- [ ] **Step 3: Implement custom table composition**

Use percentage-based seat coordinates for 2–9 seat maps, local SVG/CSS cards, tabular chip numbers, a bottom-fixed mobile action panel, and a Sheet for history below 1024 px. Motion wraps deal/chip transitions and disables them when reduced motion is requested.

- [ ] **Step 4: Verify viewports and commit**

Run: `pnpm --filter @poker/web test && pnpm --filter @poker/web test:e2e -- responsive-table.spec.ts`
Expected: PASS with no horizontal overflow or obscured primary action.

```bash
git add apps/web/src/components/poker apps/web/e2e
git commit -m "feat(ui): add responsive premium poker table"
```

### Task 3: Complete page system and points-mode Web3 exclusion

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/lobby/page.tsx`
- Modify: `apps/web/src/app/rooms/new/page.tsx`
- Modify: `apps/web/src/app/table/[roomId]/page.tsx`
- Create: `apps/web/src/app/balance/page.tsx`
- Create: `apps/web/src/app/settings/page.tsx`
- Create: `apps/web/src/modes/points-entry.tsx`
- Test: `apps/web/e2e/points-production.spec.ts`

**Interfaces:**
- Produces: production points UI with no wallet provider, RPC request, or token wording.

- [ ] **Step 1: Write failing production assertions**

```ts
test('points build exposes no Web3 behavior', async ({ page }) => {
  const rpcRequests: string[] = []
  page.on('request', request => { if (/rpc|walletconnect|reown/i.test(request.url())) rpcRequests.push(request.url()) })
  await page.goto('/lobby')
  await expect(page.getByText(/wallet|token|deposit|withdraw/i)).toHaveCount(0)
  expect(rpcRequests).toEqual([])
})
```

- [ ] **Step 2: Implement pages through the points-only entry module**

Give lobby cards explicit seats/blinds/buy-in/join state, use React Hook Form plus shared Zod room schema, and keep balance/settings mode-neutral. The points entry must have no static import of `@reown`, `wagmi`, or `viem`.

- [ ] **Step 3: Build, scan, test, and commit**

Run:

```bash
APP_MODE=points pnpm --filter @poker/web build
rg -i "walletconnect|reown|wagmi|viem" apps/web/.next/static && exit 1 || true
APP_MODE=points pnpm --filter @poker/web test:e2e -- points-production.spec.ts
```

Expected: bundle scan finds no Web3 package marker and Playwright passes.

```bash
git add apps/web
git commit -m "feat(ui): finish points-mode product experience"
```

### Task 4: Docker Compose, TLS proxy, health checks, and load baseline

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `apps/game-server/Dockerfile`
- Create: `deploy/docker-compose.yml`
- Create: `deploy/Caddyfile`
- Create: `deploy/.env.example`
- Create: `apps/game-server/src/health/health.controller.ts`
- Create: `tests/load/socket-tables.yml`
- Create: `tests/load/socket-tables-processor.ts`
- Create: `docs/operations/points-deployment.md`

**Interfaces:**
- Produces: ports 80/443 only; `/health/live`, `/health/ready`; 100-table load report.

- [ ] **Step 1: Write a failing deployment smoke script**

Run: `docker compose -f deploy/docker-compose.yml config`
Expected: FAIL before the deployment files exist.

- [ ] **Step 2: Implement private service topology**

Publish only Caddy ports. Give PostgreSQL and Redis named volumes, readiness health checks, resource limits, and private networking. Route `/api/*` and `/socket.io/*` to `game-server`; route remaining traffic to `web`.

- [ ] **Step 3: Add load assertions**

The Artillery scenario creates 100 two-player tables, completes repeated legal actions through its Socket.IO engine, reconnects 5% of clients, and fails when p95 acknowledgement exceeds 250 ms, event-loop lag exceeds 100 ms, any duplicate action is committed, or reconnect success is below 99% on the selected VM.

- [ ] **Step 4: Verify and commit**

Run:

```bash
docker compose -f deploy/docker-compose.yml up -d --build
curl -fsS http://localhost/health/ready
pnpm exec artillery run tests/load/socket-tables.yml
docker compose -f deploy/docker-compose.yml down
```

Expected: readiness succeeds and load thresholds pass.

```bash
git add deploy apps/web/Dockerfile apps/game-server/Dockerfile apps/game-server/src/health tests/load docs/operations
git commit -m "ops: add compose deployment and realtime load baseline"
```
