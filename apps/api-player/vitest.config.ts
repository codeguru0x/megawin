import { integrationConfig, nodeConfig } from "@megawin/vitest-config/dist";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Unit không cần Redis — tắt rate limit để handler Zod/use-case không 429 khi
 * máy dev có REDIS_URI. Integration dùng Redis Testcontainers.
 * `fileParallelism: false` vì `flushDb()` dùng chung 1 DB.
 */
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    projects: [
      {
        test: {
          name: "unit",
          ...nodeConfig.test,
          include: ["test/unit/**/*.test.ts"],
          setupFiles: ["test/setup.ts", "test/setup-unit-ratelimit.ts"],
          testTimeout: 10_000,
        },
      },
      {
        test: {
          name: "integration",
          ...integrationConfig.test,
          include: ["test/integration/**/*.test.ts"],
          setupFiles: ["test/setup.ts", "test/setup-integration-ratelimit.ts"],
          globalSetup: ["@megawin/vitest-config/global-setup-redis"],
          fileParallelism: false,
        },
      },
    ],
  },
});
