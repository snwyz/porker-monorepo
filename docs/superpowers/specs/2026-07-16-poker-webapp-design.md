# Texas Hold'em WebApp Design

**Date:** 2026-07-16

**Status:** Approved design

**Repository:** `/Users/code.yang/Desktop/poker-monorepo`

## 1. Objective

Build a desktop-first, responsive Texas Hold'em cash-game WebApp that supports two mutually exclusive deployment modes:

- `points`: guests play with non-transferable entertainment points and the client exposes no Web3 user experience.
- `web3`: users may browse the lobby anonymously, but must connect a wallet, sign in, deposit a Base Sepolia test token, and have sufficient escrow balance before taking a seat.

The first release supports public no-limit Hold'em cash tables for 2–9 players. It does not include tournaments, real-money mainnet assets, rake, spectators, private tables, multi-table play, chat, provably fair dealing, or multi-party/Mental Poker protocols.

## 2. Confirmed Product Decisions

| Area | Decision |
| --- | --- |
| Repository | Independent pnpm/Turbo monorepo in `poker-monorepo` |
| Game | No-limit Texas Hold'em cash tables |
| Table size | 2–9 seats |
| Table configuration | Small blind, big blind, minimum/maximum buy-in, seat count, and action timeout |
| User identity in points mode | Guest nickname with a server-issued session |
| User identity in Web3 mode | Anonymous lobby browsing; wallet connection and signed login required before sitting |
| Web3 chain | Base Sepolia |
| Wallet integration | Reown AppKit/WalletConnect with Wagmi, Viem, and TanStack Query |
| Asset modes | One global deployment mode selected by `APP_MODE=points` or `APP_MODE=web3` |
| Mode switching | Environment change plus redeployment; no runtime administration UI |
| On-chain boundary | Game actions and balances are processed off-chain; token custody and withdrawals use a smart contract |
| Dealing | Trusted server using a cryptographically secure random source; not cryptographically verifiable by players |
| UI direction | Modern premium card room: dark charcoal, green felt, walnut, and restrained warm gold |
| Responsive priority | Desktop first, with a fully playable mobile layout |
| Deployment | Single cloud VM using Docker Compose and Caddy |

## 3. Repository and Service Architecture

```text
poker-monorepo/
  apps/
    web/                 Next.js App Router application
    game-server/         Persistent HTTP, WebSocket, game, and chain worker service
  packages/
    poker-engine/        Pure TypeScript game state machine
    db/                  PostgreSQL schema, migrations, and repositories
    shared/              DTOs, schemas, event types, and identifiers
    contracts/           Foundry contracts, tests, ABI export, and deployment scripts
    config/              Shared TypeScript, ESLint, and test configuration
  deploy/
    Caddyfile
    docker-compose.yml
  docs/
```

The monorepo uses pnpm workspaces and Turbo. The web application is scaffolded with:

```bash
npx create-next-app@latest apps/poker-web --typescript --tailwind --eslint --app --src-dir --use-pnpm
```

`create-next-app@latest` must resolve to the latest stable release at scaffold time, and the generated lockfile records the exact resolved versions. Preview, canary, and release-candidate versions are excluded. Next.js 16 is the current stable major line; Next.js 16.3 was still described as a preview in June 2026.

### 3.1 `apps/poker-web`

Responsibilities:

- Render the landing page, lobby, room creation, table, balance, and settings pages.
- Establish and resume the authenticated WebSocket session.
- Render only server-authoritative game state.
- In `points` builds, load guest identity and points components without initializing Reown, Wagmi, Viem, chain RPC clients, wallet UI, or token terminology.
- In `web3` builds, support wallet connection, EIP-4361-style signed login, deposits, withdrawals, and transaction status.

Next.js does not own persistent room state and does not host the long-running WebSocket service.

### 3.2 `apps/poker-api`

The game server is a persistent Node.js service organized into identity, lobby, room, game, ledger, settlement, chain-indexer, and audit modules. NestJS with Socket.IO is the default implementation because it provides explicit module boundaries, guards, WebSocket rooms, reconnection support, and test utilities. PostgreSQL is authoritative for durable state; Redis is used for sessions, presence, transient snapshots, pub/sub readiness, rate limits, and locks.

The MVP deploys a single game-server process. The code must not assume in-memory state is durable, so a later move to multiple instances does not require changing the client protocol or poker engine.

### 3.3 `packages/poker-engine`

This package is a pure deterministic TypeScript state machine. It accepts a complete current state plus a validated command and returns a new state plus domain events. It has no imports from Next.js, NestJS, Socket.IO, databases, Redis, wallets, or contracts.

It implements:

- 2–9 player table setup and button/blind rotation.
- Pre-flop, flop, turn, river, and showdown transitions.
- Fold, check, call, bet, raise, and all-in commands.
- Minimum-raise rules and incomplete all-in raises.
- Main-pot and side-pot construction.
- Hand evaluation, ties, split pots, and deterministic odd-chip assignment.
- Table-stakes rules and add-ons only between hands.
- Player timeout, sit-out, leave-after-hand, and disconnect flags.

It does not generate random numbers. A shuffled deck is supplied by the game server when a hand begins.

### 3.4 `packages/contracts`

The Foundry package contains:

- `MockPokerToken`: a Base Sepolia ERC-20 test token with controlled test minting.
- `PokerEscrow`: deposits, EIP-712 withdrawal vouchers, monotonically increasing or consumed nonces, expiry, chain binding, pause control, operator rotation, access control, reentrancy protection, and deposit/withdrawal events.

The contract does not execute hands or track table actions. The operator can authorize withdrawals and therefore remains inside the trust boundary. This is acceptable for the testnet MVP and is not sufficient evidence of mainnet safety.

## 4. Deployment Mode Isolation

The application exposes three stable abstractions:

```ts
interface IdentityProvider {
  authenticate(input: AuthInput): Promise<PlayerIdentity>
}

interface BalanceLedger {
  reserveBuyIn(input: BuyInInput): Promise<Reservation>
  settleTable(input: TableSettlement): Promise<void>
}

interface SettlementProvider {
  prepareWithdrawal(input: WithdrawalInput): Promise<WithdrawalResult>
}
```

`points` and `web3` supply separate implementations. The poker engine consumes none of these interfaces directly.

`APP_MODE` is validated on process startup and accepts exactly `points` or `web3`. A deployment refuses to start with an unsupported value. The selected mode is returned by a public capabilities endpoint so server and client configuration can be checked for mismatch.

Mode-specific client providers are separate module entry points. The points entry point has no static import path to wallet packages. Production verification scans the points client bundles and network calls to confirm that wallet providers and chain RPC endpoints are absent. Source files may remain in the repository, but Web3 code must not be shipped to or executed by a points-mode browser.

Changing modes requires:

1. Stop creation of new rooms.
2. End or administratively close all active tables.
3. Confirm there are no pending table settlements.
4. In Web3 mode, confirm the deposit indexer has no unprocessed confirmed events.
5. Change `APP_MODE` and redeploy all application containers together.

Balances are never converted automatically between points and tokens.

## 5. User and Game Flows

### 5.1 Points mode

1. A visitor chooses an available nickname.
2. The server creates an opaque guest session in an HTTP-only secure cookie.
3. A new guest receives a configurable entertainment-points grant.
4. Joining a table creates an atomic buy-in reservation in the points ledger.
5. The reservation becomes table chips only after the seat is successfully assigned.
6. Leaving settles remaining table chips back to the points ledger.

Points cannot be transferred, withdrawn, purchased, or exchanged for tokens. Guest continuity depends on the session cookie; account binding and cross-device recovery are outside the MVP.

### 5.2 Web3 mode

1. An anonymous visitor may read the public lobby.
2. Before sitting, the visitor connects a Base Sepolia wallet through Reown AppKit.
3. The server issues a one-time nonce and the wallet signs a domain-bound login message.
4. The server verifies address, nonce, domain, chain ID, issued time, and expiry before creating a session.
5. The user deposits `MockPokerToken` into `PokerEscrow`.
6. The chain indexer credits the internal escrow ledger only after a configurable number of confirmations.
7. Buy-in, betting, and table settlement occur in the off-chain double-entry ledger.
8. A withdrawal request reserves the internal balance and returns an expiring EIP-712 operator voucher.
9. The user submits the voucher to `PokerEscrow`; the indexer marks the withdrawal complete from the emitted event.

Failed or expired withdrawals release their reservation only after a state reconciliation confirms that the voucher was not consumed on-chain.

### 5.3 Room and hand lifecycle

A public room moves through `waiting`, `playing`, `draining`, and `closed`. A hand moves through `initializing`, `preflop`, `flop`, `turn`, `river`, `showdown`, and `settled`, with early transition to `settled` when only one non-folded player remains.

The MVP uses public rooms only. A room owner configures seat count, blinds, minimum and maximum buy-in, and one of the supported action timeouts. Blinds and buy-in rules cannot change while a table has seated players.

The game server uses Node.js cryptographically secure random bytes to drive an unbiased Fisher–Yates shuffle. The seed and full deck are encrypted for restricted operational audit. Clients receive only cards they are entitled to see. Folded hole cards remain private; showdown cards and community cards enter the durable public hand history.

The trusted-server model can detect operational mistakes through audit logs but cannot prove to a player that the operator did not choose a favorable deck. Mainnet or real-value deployment requires a separate fairness design review.

## 6. Real-Time Protocol and Recovery

HTTP handles authentication, room commands, balances, deposits, withdrawals, and historical reads. Socket.IO handles table subscription, player actions, turn timers, presence, snapshots, and domain events.

Each client action carries:

- `roomId`
- `handId`
- a globally unique `actionId`
- `expectedVersion`
- the action type and typed payload

The server verifies session, seat ownership, current actor, legal action, amount, deadline, and expected state version. A committed action advances the monotonically increasing table version and is broadcast as an authoritative event. Repeated `actionId` values return the original result without applying the action twice.

On reconnect, the client sends its last confirmed event sequence. The server returns either missing events or a current snapshot followed by later events. A disconnected player retains the seat for a configurable grace period. When their turn expires, the server auto-checks if legal and otherwise auto-folds.

Durable hand events are append-only. Periodic snapshots reduce replay time. After a game-server restart, active tables are reconstructed from the last valid snapshot and subsequent events. If reconstruction validation fails, the table enters `draining`; no new hand starts, and an audited administrative settlement returns each player's last verified table balance.

## 7. Accounting and Consistency

Points, escrow balances, table chips, buy-in reservations, and withdrawal reservations use a double-entry ledger. Application code never updates a user's balance column directly. Every posting has a unique business reference and balances debits and credits in the same PostgreSQL transaction.

Required invariants include:

- Total table chips equal completed buy-ins minus completed cash-outs for that table.
- A hand conserves chips except for explicitly modeled blind and pot transfers.
- Every settled pot is zero after awards are posted.
- A deposit event is credited at most once by transaction hash plus log index.
- A withdrawal voucher consumes internal funds at most once by wallet plus nonce.
- An action is applied at most once by `actionId`.

Redis locks improve coordination but never replace PostgreSQL uniqueness constraints and transactions.

## 8. UI and Design System

### 8.1 Component strategy

```text
Radix UI accessibility primitives
  → shadcn/ui general-purpose components
  → Poker theme tokens and variants
  → Custom poker domain components
```

Tailwind CSS owns design tokens and layout. Class Variance Authority manages variants. React Hook Form and Zod handle forms. Lucide supplies interface icons. Motion is limited to dealing, chips entering the pot, turn changes, and winner feedback, and respects `prefers-reduced-motion`.

Material UI is not used because its default visual language would require extensive overrides and would not replace the custom poker table components.

### 8.2 Visual direction

Initial semantic palette:

- App background: `#0D1210`
- Raised surface: `#151B18`
- Table felt: `#0F6A4E`
- Walnut edge: `#3A2A20`
- Primary warm gold: `#D6B262`
- Primary text: `#F4EAD6`
- Muted text: `#9BA89F`
- Destructive state: `#C95D5D`

Gold is reserved for the primary action, active turn, selected controls, and high-value balance emphasis. Error, disconnect, all-in, folded, and active states use icons and text as well as color.

### 8.3 Pages

- `/`: brand entry and guest nickname; wallet connection is present only in Web3 mode.
- `/lobby`: public tables with blinds, seats, buy-in range, and join availability.
- `/rooms/new`: cash-table configuration.
- `/table/[roomId]`: table, seats, cards, pot, timer, actions, and hand history.
- `/balance`: points history or Web3 wallet/escrow/deposit/withdrawal state.
- `/settings`: nickname, sound, motion, and automatic timeout behavior.

### 8.4 Component boundaries

General components include button, dialog, sheet, dropdown menu, slider, tabs, tooltip, toast, badge, and skeleton. Poker domain components include poker table, player seat, dealer button, playing card, hole cards, community cards, pot display, chip stack, action panel, bet slider, turn timer, and hand history. Identity and balance components are mode-specific feature modules.

### 8.5 Responsive behavior

- Desktop at 1024 px and wider shows the complete 9-seat table and a persistent history panel when space allows.
- Tablet from 768–1023 px preserves all seats and moves history into a sheet.
- Mobile below 768 px fixes the action panel to the bottom, prioritizes the table and hero's hole cards, moves history into a sheet, reduces decorative animation, and collapses secondary seat metadata.
- Nine-seat mobile remains functional, but 2–6 seats is the comfortable presentation target.

SVG/CSS cards and chips are local assets so they remain sharp and require no remote image dependency.

## 9. Error Handling and Operational Safety

- Invalid commands return typed error codes and the current authoritative version; the UI resynchronizes rather than guessing.
- HTTP and WebSocket rate limits apply per session, wallet, and IP, with stricter limits for authentication, room creation, deposits, and withdrawals.
- Expired guest or wallet sessions redirect to re-authentication without discarding the locally displayed table state; play resumes only after server confirmation.
- Chain RPC failures pause new deposits and withdrawals but do not interrupt existing off-chain hands.
- Indexer progress and last processed block are durable. Reorg handling rewinds to a stored safe checkpoint and replays idempotently.
- Operator signing keys are injected through deployment secrets and never stored in source, client bundles, PostgreSQL, or logs.
- Structured logs redact signatures, cookies, private cards, random seeds, and secrets.
- Health checks distinguish liveness, database readiness, Redis readiness, and chain-indexer lag.
- Caddy provides TLS and WebSocket proxying. Application containers are not exposed directly to the public network.

## 10. Test and Verification Strategy

### 10.1 Poker engine

Unit and table-driven tests cover hand comparison, betting rounds, blinds, minimum raises, incomplete all-ins, main and side pots, split pots, odd chips, timeout actions, sit-outs, add-ons between hands, and 2–9 player button movement.

Property tests verify:

- Card uniqueness.
- Chip conservation.
- Pot exhaustion after settlement.
- No folded player can win a pot.
- Replaying the same legal command sequence yields the same events and state.

### 10.2 Game server and database

Integration tests use real PostgreSQL and Redis containers to cover simultaneous actions, stale versions, repeated messages, buy-in races, disconnect/reconnect, snapshot replay, process restart, settlement rollback, and ledger invariants.

### 10.3 Contracts and chain integration

Foundry unit and fuzz tests cover deposits, voucher signatures, wrong chain/domain, nonce replay, expiry, pause, role changes, reentrancy, and event emission. An Anvil suite tests the indexer and end-to-end deposit/withdrawal flow before Base Sepolia deployment.

### 10.4 Browser and load tests

Playwright covers:

- Guest entry, room creation, seating, one complete points-mode hand, leave, and balance settlement.
- Wallet connection, signed login, deposit, seating, one complete Web3-mode hand, leave, and withdrawal.
- Reconnect during a hand and authoritative state recovery.
- Points-mode bundle and network verification that no wallet provider or chain RPC initializes.

A Socket.IO load scenario with 100 simultaneously active tables is the MVP capacity acceptance baseline on the selected VM size. The test reports action acknowledgement latency, event broadcast latency, reconnect success, database contention, and event-loop lag; it is not considered passed solely because connections remain open.

## 11. Deployment Topology

Docker Compose runs:

- `web`
- `game-server`
- `postgres`
- `redis`
- `caddy`

Only Caddy publishes ports 80 and 443. PostgreSQL and Redis use persistent volumes and private networking. Production configuration includes backups, resource limits, log rotation, readiness checks, and restart policies. Contract deployment remains a controlled operator command and is not performed automatically during an application container restart.

## 12. Delivery Sequence and Acceptance

### Milestone 1: Foundation and poker engine

Deliver the monorepo, shared schemas, poker state machine, evaluator, betting logic, side pots, and exhaustive engine tests. Acceptance requires all engine invariants and 2–9 seat scenarios to pass.

### Milestone 2: Points-mode vertical slice

Deliver guest sessions, public rooms, WebSocket play, PostgreSQL ledger, Redis recovery support, and a functional unpolished UI. Acceptance requires multiple browsers to complete hands, disconnect/reconnect, leave, and preserve points correctly.

### Milestone 3: Production UI and operations

Deliver the premium card-room design system, desktop/mobile layouts, audit history, restart recovery, Caddy, and Docker Compose. Acceptance requires the points-mode Playwright suite and 100-table load baseline to pass.

### Milestone 4: Web3 testnet mode

Deliver Base Sepolia contracts, Reown AppKit, signed wallet login, indexer, deposits, escrow ledger, withdrawal vouchers, and Web3 browser tests. Acceptance requires the complete deposit-to-play-to-withdraw flow on Base Sepolia and points-mode Web3-exclusion checks to pass.

### Milestone 5: Hardening

Deliver threat-model fixes, rate limits, recovery drills, backup/restore verification, secret-management documentation, and operator runbooks. Acceptance requires contract fuzz tests, process-restart recovery, database restore, indexer replay, and critical-path browser tests to pass in a production-like environment.

A single experienced full-stack engineer should budget approximately 5–7 weeks for the points-mode closed loop and 10–14 weeks for the testnet Web3 MVP. These are planning ranges, not delivery guarantees, and exclude mainnet audits, legal work, and real-money compliance.

## 13. Feasibility and Explicit Blockers

The testnet MVP is technically feasible with no known hard blocker. The following constraints become blockers if the scope expands without a separate design phase:

1. **Real-value assets:** smart-contract audit, production key custody, treasury controls, monitoring, incident response, and jurisdiction-specific gambling/financial compliance are mandatory before mainnet value is accepted.
2. **Provable fairness:** trusted server randomness cannot prove operator neutrality. Commit/reveal, VRF-assisted protocols, or multi-party shuffling requires a new protocol and failure-recovery design.
3. **Horizontal scale:** more than one active game-server writer requires explicit table ownership, fencing tokens, cross-instance event routing, and failover tests.
4. **Mode isolation:** hiding controls is insufficient. Points builds must exclude wallet initialization, RPC requests, Web3 routes, and token terminology from browser behavior.
5. **Chain consistency:** deposits and withdrawals require confirmation policy, reorg-safe indexing, replay protection, and reconciliation; database success alone never proves chain completion.

## 14. Primary Technical References

- [Next.js 16 release](https://nextjs.org/blog/next-16)
- [Next.js `create-next-app` guidance](https://nextjs.org/blog/next-16-1)
- [Reown AppKit for Next.js App Router](https://docs.reown.com/appkit/next/core/installation)
- [Chainlink developer documentation and VRF overview](https://docs.chain.link/)
