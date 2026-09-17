import { integrationConfig, nodeConfig } from "@megawin/vitest-config/dist";
import { defineConfig } from "vitest/config";

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
          // flushDb() trong beforeEach của từng file — không chạy song song 2 file
          // trên cùng 1 Redis DB (tránh file A xoá data file B đang test).
          fileParallelism: false,
        },
      },
    ],
  },
});
