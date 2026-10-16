import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: {
      "@std/fs/walk":
        new URL("./tests/migration/std-tooling.ts", import.meta.url).pathname,
      "@std/cli/parse-args":
        new URL("./tests/migration/std-tooling.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["tests/cloudflare/**"],
    pool: "forks",
    isolate: true,
    passWithNoTests: true, // Deno permits the existing empty quoteSummary suite.
    maxWorkers: 4,
    fileParallelism: true,
    testTimeout: 10000,
    coverage: { provider: "v8", reportsDirectory: "coverage/migration" },
  },
});
