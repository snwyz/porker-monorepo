# Foundation and Poker Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the pnpm/Turbo workspace and a deterministic, exhaustively tested 2–9 player no-limit Hold'em engine.

**Architecture:** `packages/poker-engine` is a pure reducer with no network, persistence, randomness, or wallet dependencies. `packages/shared` owns validated wire/domain identifiers; callers supply the shuffled deck and persist returned events.

**Tech Stack:** pnpm workspaces, Turbo, TypeScript, Vitest, fast-check, Zod.

## Global Constraints

- Repository: independent pnpm/Turbo monorepo in `poker-next`.
- Game: public no-limit Texas Hold'em cash tables with 2–9 seats.
- No tournaments, rake, spectators, private tables, chat, or provably fair protocol.
- Engine generates no random numbers and imports no framework, database, Redis, wallet, or contract package.

---

### Task 1: Workspace and validated shared protocol

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.json`
- Create: `packages/config/tsconfig.base.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/ids.ts`
- Create: `packages/shared/src/protocol.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/protocol.test.ts`

**Interfaces:**
- Produces: branded `RoomId`, `HandId`, `PlayerId`, `ActionId`; `PlayerActionSchema`; `PlayerAction`.

- [ ] **Step 1: Add the workspace manifests and install the exact locked toolchain**

Create root scripts `build`, `test`, `typecheck`, `lint`, and `format` using `turbo run`. Configure workspace globs as `apps/*` and `packages/*`, then run:

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm add -Dw turbo typescript vitest fast-check zod prettier eslint
```

Expected: `pnpm-lock.yaml` exists and `pnpm --version` succeeds.

- [ ] **Step 2: Write the failing protocol validation test**

```ts
import { describe, expect, it } from 'vitest'
import { PlayerActionSchema } from './protocol'

describe('PlayerActionSchema', () => {
  it('rejects a raise without a positive integer amount', () => {
    expect(() => PlayerActionSchema.parse({
      roomId: 'room-1', handId: 'hand-1', actionId: 'action-1',
      expectedVersion: 4, type: 'raise', amount: 0,
    })).toThrow()
  })
})
```

- [ ] **Step 3: Run the test and verify failure**

Run: `pnpm --filter @poker/shared test -- protocol.test.ts`
Expected: FAIL because `PlayerActionSchema` does not exist.

- [ ] **Step 4: Implement the discriminated action schema and branded ID helpers**

```ts
import { z } from 'zod'

const id = z.string().min(1)
const base = { roomId: id, handId: id, actionId: id, expectedVersion: z.number().int().nonnegative() }

export const PlayerActionSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('fold') }),
  z.object({ ...base, type: z.literal('check') }),
  z.object({ ...base, type: z.literal('call') }),
  z.object({ ...base, type: z.literal('bet'), amount: z.number().int().positive() }),
  z.object({ ...base, type: z.literal('raise'), amount: z.number().int().positive() }),
])
export type PlayerAction = z.infer<typeof PlayerActionSchema>
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @poker/shared test && pnpm --filter @poker/shared typecheck`
Expected: PASS.

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.json packages/config packages/shared
git commit -m "build: initialize poker monorepo and shared protocol"
```

### Task 2: Card model, deck validation, and seven-card evaluator

**Files:**
- Create: `packages/poker-engine/package.json`
- Create: `packages/poker-engine/src/cards.ts`
- Create: `packages/poker-engine/src/evaluator.ts`
- Create: `packages/poker-engine/src/index.ts`
- Test: `packages/poker-engine/src/evaluator.test.ts`

**Interfaces:**
- Produces: `Card`, `Deck`, `parseCard(code)`, `validateDeck(cards)`, `evaluateSeven(cards)`, `compareHands(a, b)`.

- [ ] **Step 1: Write failing evaluator examples**

```ts
import { describe, expect, it } from 'vitest'
import { evaluateSeven, parseCards } from './index'

describe('evaluateSeven', () => {
  it.each([
    ['As Ks Qs Js Ts 2d 3c', 'straight-flush'],
    ['Ah Ad Ac As 2d 3c 4h', 'four-kind'],
    ['Kh Kd Ks 2c 2d 8h 9s', 'full-house'],
    ['Ah 2d 3s 4c 5h Kd Qd', 'straight'],
  ])('scores %s as %s', (codes, category) => {
    expect(evaluateSeven(parseCards(codes)).category).toBe(category)
  })
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @poker/engine test -- evaluator.test.ts`
Expected: FAIL because the evaluator exports do not exist.

- [ ] **Step 3: Implement immutable cards and evaluator scoring**

Use rank values `2..14`, enumerate every 5-card combination from seven cards, and score a five-card hand as a lexicographically comparable tuple:

```ts
export type HandCategory = 'high-card'|'pair'|'two-pair'|'three-kind'|'straight'|'flush'|'full-house'|'four-kind'|'straight-flush'
export type HandScore = { category: HandCategory; value: readonly number[] }

export function compareHands(a: HandScore, b: HandScore): number {
  const length = Math.max(a.value.length, b.value.length)
  for (let i = 0; i < length; i += 1) {
    const difference = (a.value[i] ?? 0) - (b.value[i] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}
```

The first tuple element is category strength `0..8`; remaining elements are ordered kickers. Treat ace as both `14` and low only for `A-2-3-4-5`. Reject duplicate cards and any seven-card input whose length is not exactly seven.

- [ ] **Step 4: Add exhaustive category, tie, kicker, wheel, and duplicate-card tests**

Run: `pnpm --filter @poker/engine test -- evaluator.test.ts`
Expected: PASS with at least one winner and one tie example per category.

- [ ] **Step 5: Commit**

```bash
git add packages/poker-engine
git commit -m "feat(engine): add card model and hand evaluator"
```

### Task 3: Table state and legal betting reducer

**Files:**
- Create: `packages/poker-engine/src/state.ts`
- Create: `packages/poker-engine/src/commands.ts`
- Create: `packages/poker-engine/src/reducer.ts`
- Test: `packages/poker-engine/src/reducer.test.ts`

**Interfaces:**
- Consumes: validated `PlayerAction`; `Card[]` supplied at hand start.
- Produces: `applyCommand(state, command): Transition`, `legalActions(state, playerId): LegalAction[]`.

- [ ] **Step 1: Write a failing pre-flop action test**

```ts
it('posts blinds and accepts a legal call without mutating input', () => {
  const state = headsUpHand({ stacks: [1000, 1000], blinds: [5, 10] })
  const transition = applyCommand(state, { type: 'call', playerId: state.actorId })
  expect(transition.state.players.map(p => p.stack)).toEqual([990, 990])
  expect(transition.events.at(-1)?.type).toBe('player-called')
  expect(state.players.map(p => p.stack)).toEqual([995, 990])
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @poker/engine test -- reducer.test.ts`
Expected: FAIL because `applyCommand` is missing.

- [ ] **Step 3: Implement command validation and immutable transitions**

Model `phase`, `version`, `buttonSeat`, `actorId`, `currentBet`, `minimumRaise`, per-player `stack`, `streetCommitted`, `handCommitted`, and status. Return typed errors `NOT_ACTOR`, `STALE_VERSION`, `ILLEGAL_ACTION`, and `INVALID_AMOUNT`; never partially mutate state.

```ts
export type Transition = { state: TableState; events: readonly GameEvent[] }
export type CommandResult =
  | { ok: true; transition: Transition }
  | { ok: false; code: 'NOT_ACTOR'|'STALE_VERSION'|'ILLEGAL_ACTION'|'INVALID_AMOUNT'; version: number }
```

Implement fold, check, call, bet, raise-to, and all-in via the bet/raise commands. A raise amount is the player's total street commitment after the action, not the increment.

- [ ] **Step 4: Add table-driven betting tests**

Cover insufficient call all-in, minimum raise, incomplete all-in not reopening action, illegal check, over-stack raise, and street completion.

Run: `pnpm --filter @poker/engine test -- reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/poker-engine/src
git commit -m "feat(engine): implement no-limit betting reducer"
```

### Task 4: Pots, showdown, lifecycle, and engine invariants

**Files:**
- Create: `packages/poker-engine/src/pots.ts`
- Create: `packages/poker-engine/src/lifecycle.ts`
- Create: `packages/poker-engine/src/invariants.ts`
- Test: `packages/poker-engine/src/pots.test.ts`
- Test: `packages/poker-engine/src/lifecycle.test.ts`
- Test: `packages/poker-engine/src/properties.test.ts`

**Interfaces:**
- Produces: `buildPots(players)`, `settleShowdown(state)`, `advanceHand(state)`, `assertInvariants(state)`.

- [ ] **Step 1: Write failing side-pot and split-pot tests**

```ts
it('builds main and side pots from 50/100/200 commitments', () => {
  expect(buildPots(playersWithCommitments([50, 100, 200]))).toEqual([
    { amount: 150, eligible: ['p1','p2','p3'] },
    { amount: 100, eligible: ['p2','p3'] },
    { amount: 100, eligible: ['p3'] },
  ])
})
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @poker/engine test -- pots.test.ts lifecycle.test.ts`
Expected: FAIL because pot and lifecycle functions are missing.

- [ ] **Step 3: Implement pot layers and deterministic odd chips**

Build each layer from sorted unique positive commitments. Folded players contribute but are omitted from `eligible`. At showdown, divide each pot equally among tied winners and award remainder chips one at a time clockwise starting left of the button.

- [ ] **Step 4: Implement lifecycle and property tests**

Advance button and blinds across active seats, support 2–9 players, auto-check or auto-fold on timeout, permit add-on only between hands, and end immediately when one non-folded player remains.

```ts
import fc from 'fast-check'

it('conserves chips across every accepted command', () => {
  fc.assert(fc.property(commandSequenceArbitrary(), commands => {
    const initial = generatedTable(commands.seed)
    const final = runAcceptedCommands(initial, commands.items)
    expect(totalChips(final)).toBe(totalChips(initial))
  }))
})
```

Run: `pnpm --filter @poker/engine test`
Expected: PASS for unit, table-driven, and property suites.

- [ ] **Step 5: Run phase acceptance and commit**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: every Turbo task succeeds; coverage includes every engine module.

```bash
git add packages/poker-engine packages/shared
git commit -m "feat(engine): complete cash-game lifecycle and invariants"
```
