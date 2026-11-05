import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Tests never load CSS; skip the Tailwind PostCSS pipeline.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // `server-only` throws outside a React Server Component bundle; it is a no-op in tests.
      "server-only": path.resolve(root, "tests/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Integration tests share one database: run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
