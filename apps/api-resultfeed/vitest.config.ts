import { nodeConfig } from "@megawin/vitest-config/dist";
import { defineConfig } from "vitest/config";

// App này là glue mỏng quanh use-case ở package -application (đã có integration test riêng,
// guard bằng db-guard). Test ở đây chỉ kiểm tra WIRING của handler (mock use-case, KHÔNG
// chạm DB) → dùng nodeConfig, không cần db-guard/globalSetup.
export default defineConfig({
  ...nodeConfig,
  test: {
    ...nodeConfig.test,
    include: ["test/**/*.test.ts"],
  },
});
