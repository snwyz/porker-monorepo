import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        "pnpm --dir ../.. --filter @poker/game-server... build && ../../packages/db/node_modules/.bin/prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma && node ../../apps/game-server/dist/apps/game-server/src/main.js",
      url: "http://127.0.0.1:3001/v1/capabilities",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        APP_MODE: "points",
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://poker:poker@127.0.0.1:55432/poker_test",
        POKER_AUDIT_KEY:
          process.env.POKER_AUDIT_KEY ??
          "test-audit-key-with-at-least-32-bytes",
        POKER_DISCONNECT_GRACE_MS: "2000",
        PORT: "3001",
      },
    },
    {
      command:
        "./node_modules/.bin/next build --webpack && NODE_ENV=production PORT=3100 node server.mjs",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        GAME_SERVER_URL: process.env.GAME_SERVER_URL ?? "http://127.0.0.1:3001",
        POKER_ENABLE_TEST_HARNESS: "1",
      },
    },
  ],
});
