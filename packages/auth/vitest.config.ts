import { integrationConfig, nodeConfig } from "@megawin/vitest-config/dist";
import { defineConfig } from "vitest/config";

/**
 * Unit không cần Redis. Integration dùng Redis Testcontainers (`global-setup-redis`).
 * `fileParallelism: false` vì `flushDb()` trong beforeEach dùng chung 1 DB.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          ...nodeConfig.test,
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          ...integrationConfig.test,
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["@megawin/vitest-config/global-setup-redis"],
          fileParallelism: false,
        },
      },
    ],
  },
});
