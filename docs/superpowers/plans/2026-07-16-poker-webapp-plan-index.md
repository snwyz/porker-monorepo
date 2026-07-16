# Poker WebApp Implementation Plan Index

**Source spec:** `docs/superpowers/specs/2026-07-16-poker-webapp-design.md`

The design spans five independently reviewable systems. Execute these plans in order; do not start a later plan until the previous plan's acceptance commands pass and its interfaces are committed.

1. `2026-07-16-01-foundation-poker-engine.md` — workspace, shared protocol, deterministic engine, evaluator, betting, side pots, property tests.
2. `2026-07-16-02-points-realtime-slice.md` — PostgreSQL, guest sessions, double-entry points ledger, rooms, Socket.IO, recovery, functional Next.js client.
3. `2026-07-16-03-premium-ui-deployment.md` — Radix/shadcn layer, premium poker components, responsive pages, Playwright, Docker Compose, Caddy, load test.
4. `2026-07-16-04-web3-testnet.md` — Foundry contracts, Reown AppKit, signed login, chain indexer, deposits, vouchers, Base Sepolia flow.
5. `2026-07-16-05-hardening-operations.md` — rate limits, redaction, recovery drills, backups, reconciliation, security and release gates.

Each task ends in a focused commit. Commands assume execution from `/Users/code.yang/Desktop/poker-next` unless a task says otherwise.
