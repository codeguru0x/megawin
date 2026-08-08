import { nodeConfig } from "@megawin/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...nodeConfig,
  test: {
    ...nodeConfig.test,
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
