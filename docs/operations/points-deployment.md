# Points deployment operations

This runbook deploys the points-only stack on one Docker host. Caddy is the
only public service; the web app, game server, PostgreSQL, and Redis remain on
an internal Docker network. Caddy alone also joins an edge bridge so Docker can
publish TCP 80/443 and UDP 443; no application or data service joins that edge
network.

## Host and secrets

Use a current Docker Engine with Compose v2. The 100-table baseline is intended
for a dedicated VM with at least 4 vCPU, 8 GiB RAM, and SSD storage. Do not
compare its thresholds with a contended laptop run.

Container builds default to the approved Taobao npmmirror registry
(`https://registry.npmmirror.com/`). An operator can override the
`NPM_REGISTRY` build argument only after approving that registry explicitly;
the deployment procedure must not silently fall back to the official npm
registry. The builder installs the repository-pinned `pnpm@11.13.1` directly
from that registry instead of allowing Corepack to resolve it implicitly.
Prisma engine artifacts use the matching Taobao mirror at
`https://npmmirror.com/mirrors/prisma`.

Create the deployment environment without committing it:

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Replace both placeholder secrets. `POSTGRES_PASSWORD` must be a long random
password. `POKER_AUDIT_KEY` must contain at least 32 random bytes and must be
backed up separately; losing it makes encrypted hand/audit state unusable.
Keep `APP_MODE=points`. Before every start, validate the fully rendered model:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml config
```

The compose defaults exist only so CI can validate configuration. They are not
production credentials.

## Start and health

Build and start the private stack:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
curl -fsS http://localhost/health/live
curl -fsS http://localhost/health/ready
```

`live` proves the Node process can serve requests. `ready` runs a real
PostgreSQL `SELECT 1` and Redis `PING`; it returns HTTP 503 until both succeed.
Compose waits for database and cache health before starting the game server,
then waits for game readiness before starting the web and Caddy services.

For a local host, Caddy serves HTTP and HTTPS with its internal CA. Import the
Caddy root certificate from the `caddy_data` volume into the local trust store
before browser testing HTTPS. For an internet host, review the Caddyfile with
the operator and replace the `tls internal` site with a public DNS name using
Caddy's automatic public certificates. Open no PostgreSQL, Redis, web, or game
server port at the host firewall.

Useful diagnostics:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml ps
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs --tail=200 caddy game-server web
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec redis redis-cli ping
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec postgres pg_isready -U poker -d poker
```

## 100-table load baseline

Run the baseline from the selected VM, after readiness is green:

```bash
mkdir -p test-results/load
pnpm exec artillery run tests/load/socket-tables.yml --output test-results/load/socket-tables.json
pnpm exec artillery report test-results/load/socket-tables.json
```

To target a different approved host, override the processor variable explicitly
with `--variables '{"loadTarget":"https://approved-host"}'`; Artillery's
generic `--target` flag does not rewrite custom processor requests.

The scenario creates 100 independent two-seat rooms and 200 authenticated
players, joins both seats, repeatedly derives and submits legal actions from
authoritative snapshots, and resends one action ID per table. Ten of the 200
clients reconnect, which is exactly 5%. Its ensure gates fail the run when:

- Socket.IO acknowledgement p95 is above 250 ms.
- game-server event-loop scheduling lag is above 100 ms (sampled through the
  private health route, not inferred from the load-generator process).
- resending an action changes its acknowledgement, indicating another commit.
- fewer than 99% of attempted reconnects complete.

The duplicate assertion observes the public idempotency contract (the same
action ID must return the exact original acknowledgement); it does not query
PostgreSQL internals. Preserve the JSON output with the VM type, CPU/memory,
Docker versions, commit SHA, date, and compose logs. A laptop result is useful
for debugging but is not a release capacity claim.

## Backup and restore

Create encrypted, access-controlled backups on a schedule. PostgreSQL is the
authoritative ledger and table history; Redis is currently required for
readiness but must not be treated as authoritative data.

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T postgres \
  pg_dump -U poker -d poker -Fc > poker.dump
docker compose --env-file deploy/.env -f deploy/docker-compose.yml exec -T postgres \
  pg_restore -U poker -d poker --clean --if-exists < poker.dump
```

Test restores on an isolated host. Back up the audit key and deployment env in
the secrets system, never in the database dump or repository.

## Upgrade, rollback, and shutdown

Before upgrading, save a database backup, record the image/commit SHA, render
the compose config, and run the health and load gates. Then rebuild and watch
readiness and logs. Prisma applies forward migrations before the game server
starts.

For an application rollback, restore the previous repository/image SHA and run
`up -d --build` again. Do not assume database migrations are reversible: if an
upgrade changed the schema incompatibly, follow that migration's documented
forward repair or restore the matching database backup in a maintenance
window. Never point old code at an incompatible newer schema.

Graceful shutdown keeps named data volumes:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml down
```

Do not add `--volumes` during normal shutdown or rollback. That option destroys
the PostgreSQL, Redis, and Caddy named volumes.
