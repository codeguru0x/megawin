import { defineConfig } from "vitest/config";

/**
 * Root Vitest projects — chỉ dùng khi chạy `vitest` từ root monorepo
 * (IDE multi-project / smoke tay). CI và `pnpm test` chạy **per-package**
 * qua Turbo (`vitest run` trong từng app/package), không đọc file này.
 *
 * Glob tự bắt mọi `vitest.config.ts` mới dưới `apps/` và `packages/` —
 * không cần sửa file này khi thêm package.
 */
export default defineConfig({
  test: {
    projects: ["apps/*/vitest.config.ts", "packages/*/vitest.config.ts"],
  },
});
