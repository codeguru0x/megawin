import { defineConfig } from "vitest/config";
import { nodeConfig } from "@megawin/vitest-config";

export default defineConfig({
  ...nodeConfig,
  test: {
    ...nodeConfig.test,
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
