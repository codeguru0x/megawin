import { integrationConfig, nodeConfig } from "@megawin/vitest-config/dist";
import { defineConfig } from "vitest/config";

/** Vitest config — unit (pure) + integration (Mongo Testcontainers). */
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
          globalSetup: ["@megawin/vitest-config/global-setup-mongo"],
        },
      },
    ],
  },
});
