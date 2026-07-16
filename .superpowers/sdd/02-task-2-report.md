# Plan 02 Task 2 Implementation Report

## Outcome

- Added the NestJS `@poker/game-server` points-mode HTTP application.
- Added `POST /v1/guest-session`, `GET/POST /v1/rooms`, and `GET /v1/capabilities`.
- Added exact `APP_MODE=points|web3` startup validation and startup-selected capability reporting.
- Guest sessions use 256-bit opaque tokens, SHA-256 token hashes at rest, 30-day expiry, and an `HttpOnly; Secure; SameSite=Lax` cookie.
- Nicknames are restricted to 3-24 ASCII letters, digits, or underscore and protected by a database unique index.
- New guests receive exactly 10,000 points through the hardened balanced ledger using `guest-grant:<userId>`.
- Added constrained `@poker/db` guest/room repository operations; the unrestricted Prisma client remains private.
- Added shared Zod room validation plus database checks for public cash rooms, 2-9 seats, blind/buy-in ordering, and 10-120 second action timeouts.

## TDD Evidence

- Initial behavior RED: `APP_MODE=points pnpm --filter @poker/game-server test:e2e -- points-api.e2e-spec.ts` produced 16 expected failures: HTTP endpoints returned 404 and unsupported `APP_MODE` was accepted.
- Self-review RED: capability startup-state test produced the expected single failure (`expected 200, got 500`) when `process.env.APP_MODE` changed after startup.
- Final focused GREEN: same focused e2e command passed 1 file / 16 tests.
- Covered session reuse, duplicate and invalid nicknames, opaque-token hashing, secure cookie attributes, exact ledger reference/balance effects, invalid startup mode, stable capabilities, room persistence/listing, public/cash enforcement, and validation boundaries.

## Verification Evidence

- `pnpm lint`: 4/4 package tasks passed.
- `pnpm typecheck`: 4/4 package tasks passed.
- `pnpm build`: 4/4 package tasks passed.
- `pnpm format`: 4/4 package tasks passed.
- `APP_MODE=points DATABASE_URL=... pnpm test`: 6/6 Turbo tasks passed; 124 tests total (82 engine, 25 database, 16 game-server, 1 shared).
- `prisma migrate status`: 2 migrations found; disposable PostgreSQL schema up to date.
- `git diff --check`: passed.

## Dependency and Database Notes

- Required NestJS/Supertest packages were installed from the explicitly authorized official npm registry after the internal mirror failed.
- `allowBuilds` is explicitly limited to `@prisma/client`, `@prisma/engines`, and `prisma`; Prisma generation succeeded.
- E2E cleanup does not delete posted ledger data; it respects the existing immutable-ledger triggers. Full root tests run sequentially to prevent disposable-database suite races.
- The disposable `compose.test.yml` PostgreSQL service was stopped and removed after verification.

## Self-review

- Corrected an initial attempt to expose Prisma after the database public-surface regression caught it; final code exposes only constrained guest/room operations.
- Capability responses are bound to the mode validated at startup, not mutable environment state.
- No wallet, token-purchase, transfer, withdrawal, private-room, or non-cash-room functionality was introduced.
