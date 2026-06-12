import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./worker.ts",
      miniflare: {
        compatibilityDate: "2026-06-12",
        compatibilityFlags: ["nodejs_compat"],
      },
    }),
  ],
  test: {
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ["tough-cookie", "tldts"],
        },
      },
    },
  },
});
