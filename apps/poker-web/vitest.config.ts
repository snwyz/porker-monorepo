import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@poker/i18n": fileURLToPath(
        new URL("../../packages/i18n/src/index.ts", import.meta.url),
      ),
      "@poker/next-i18n/browser": fileURLToPath(
        new URL("../../packages/next-i18n/src/browser.ts", import.meta.url),
      ),
      "@poker/next-i18n/react": fileURLToPath(
        new URL("../../packages/next-i18n/src/react.tsx", import.meta.url),
      ),
      "@poker/next-i18n/next": fileURLToPath(
        new URL("../../packages/next-i18n/src/next.tsx", import.meta.url),
      ),
      "@poker/next-i18n/proxy": fileURLToPath(
        new URL("../../packages/next-i18n/src/proxy.ts", import.meta.url),
      ),
    },
  },
});
