import { defineConfig, devices } from "@playwright/test";

const appMode = process.env.APP_MODE ?? "points";
const gameServerPort = process.env.POKER_E2E_SERVER_PORT ?? "3201";
const webPort = process.env.POKER_E2E_WEB_PORT ?? "3300";
const gameServerUrl = `http://127.0.0.1:${gameServerPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        "pnpm --dir ../.. --filter @poker/game-server... build && ../../packages/db/node_modules/.bin/prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma && node ../../apps/poker-api/dist/apps/poker-api/src/main.js",
      url: `${gameServerUrl}/v1/capabilities`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        APP_MODE: appMode,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://poker:poker@127.0.0.1:55432/poker_test",
        POKER_AUDIT_KEY:
          process.env.POKER_AUDIT_KEY ??
          "test-audit-key-with-at-least-32-bytes",
        POKER_DISCONNECT_GRACE_MS: "2000",
        PORT: gameServerPort,
        WALLET_LOGIN_DOMAIN:
          process.env.WALLET_LOGIN_DOMAIN ?? `127.0.0.1:${webPort}`,
        WALLET_LOGIN_URI:
          process.env.WALLET_LOGIN_URI ?? webUrl,
        CHAIN_ID: process.env.CHAIN_ID ?? "84532",
        CHAIN_RPC_URL:
          process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545",
        ESCROW_ADDRESS:
          process.env.ESCROW_ADDRESS ??
          "0x0000000000000000000000000000000000000001",
        OPERATOR_PRIVATE_KEY:
          process.env.OPERATOR_PRIVATE_KEY ??
          "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        OPERATOR_ADDRESS:
          process.env.OPERATOR_ADDRESS ??
          "0xFCAd0B19bB29D4674531d6f115237E16AfCE377c",
        CHAIN_POLL_INTERVAL_MS: "60000",
        WITHDRAWAL_RECONCILE_INTERVAL_MS: "60000",
      },
    },
    {
      command:
        `./node_modules/.bin/next build --webpack && NODE_ENV=production PORT=${webPort} node server.mjs`,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        APP_MODE: appMode,
        GAME_SERVER_URL: process.env.GAME_SERVER_URL ?? gameServerUrl,
        PORT: webPort,
        POKER_ENABLE_TEST_HARNESS: "1",
        NEXT_PUBLIC_WALLET_LOGIN_DOMAIN:
          process.env.NEXT_PUBLIC_WALLET_LOGIN_DOMAIN ??
          `127.0.0.1:${webPort}`,
        NEXT_PUBLIC_WALLET_LOGIN_URI:
          process.env.NEXT_PUBLIC_WALLET_LOGIN_URI ?? webUrl,
        NEXT_PUBLIC_POKER_TOKEN_ADDRESS:
          process.env.NEXT_PUBLIC_POKER_TOKEN_ADDRESS ??
          "0x0000000000000000000000000000000000000002",
        NEXT_PUBLIC_ESCROW_ADDRESS:
          process.env.NEXT_PUBLIC_ESCROW_ADDRESS ??
          "0x0000000000000000000000000000000000000001",
      },
    },
  ],
});
