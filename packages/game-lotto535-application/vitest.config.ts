import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { sharedConfig } from "@megawin/vitest-config/dist";

export default defineConfig(({ mode }) => ({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    env: loadEnv(mode, import.meta.dirname, ""),
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    globalSetup: ["test/global-setup.ts"],
  },
}));
