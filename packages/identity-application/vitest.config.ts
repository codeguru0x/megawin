import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { integrationConfig } from "@megawin/vitest-config/dist";

export default defineConfig(({ mode }) => ({
  ...integrationConfig,
  test: {
    ...integrationConfig.test,
    env: loadEnv(mode, process.cwd(), ""),
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
  },
}));
