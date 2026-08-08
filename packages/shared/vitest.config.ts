import { sharedConfig } from "@megawin/vitest-config/dist";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
