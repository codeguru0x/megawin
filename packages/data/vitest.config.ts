import { defineConfig } from "vitest/config";
import { sharedConfig } from "@megawin/vitest-config/dist";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
