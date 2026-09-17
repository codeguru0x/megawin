import { nodeConfig } from "@megawin/vitest-config/dist";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...nodeConfig,
  test: {
    ...nodeConfig.test,
    include: ["test/unit/**/*.test.ts"],
  },
});
