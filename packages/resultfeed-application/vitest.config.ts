import { integrationConfig } from "@megawin/vitest-config/dist";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  ...integrationConfig,
  test: {
    ...integrationConfig.test,
    env: loadEnv(mode, import.meta.dirname, ""),
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
  },
}));
