import { nodeConfig } from "@megawin/vitest-config/dist";
import { defineConfig } from "vitest/config";

// ops-docs là registry tài liệu thuần (manifest + helper tra cứu), không I/O.
// Dùng nodeConfig, không cần db-guard/globalSetup.
export default defineConfig({
  ...nodeConfig,
  test: {
    ...nodeConfig.test,
    include: ["test/**/*.test.ts"],
  },
});
