import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@poker/i18n": fileURLToPath(
        new URL("../../packages/i18n/src/index.ts", import.meta.url),
      ),
    },
  },
});
