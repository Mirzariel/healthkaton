import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node", hookTimeout: 120_000, testTimeout: 60_000 },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
