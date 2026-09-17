import { nodeConfig } from "@megawin/vitest-config/dist";
import { defineConfig } from "vitest/config";

// Worker/API glue — mock use-case, KHÔNG chạm DB → chỉ `test/unit`.
export default defineConfig({
  ...nodeConfig,
  test: {
    ...nodeConfig.test,
    include: ["test/unit/**/*.test.ts"],
  },
});
