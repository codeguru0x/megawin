/**
 * @megawin/vitest-config — NGUỒN CHÂN LÝ DUY NHẤT cho cấu hình Vitest toàn monorepo.
 *
 * 3 preset theo tầng package (xem `.cursor/plans/monorepo-test-setup/00-overview.md`):
 * - `nodeConfig`      — domain pure (không DB) + workers glue thuần logic.
 * - `integrationConfig` — application/infra Node + Mongo (RỦI RO DB staging chung).
 * - `jsdomConfig`     — UI (`@megawin/ui`) / Next.js (`backoffice`), React Testing Library.
 */

import type { ViteUserConfig as UserConfig } from "vitest/config";

/** Domain pure + workers thuần logic — không DB, không setupFiles. */
export const nodeConfig: UserConfig = {
  test: {
    globals: true,
    environment: "node",
    // Cho phép package đã scaffold config nhưng CHƯA có file *.test.ts (test viết sau)
    // chạy `vitest run` không fail — tránh chặn CI trong giai đoạn scaffold-trước-viết-test.
    passWithNoTests: true,
  },
};

/**
 * Giữ lại cho backward-compat — các `vitest.config.ts` cũ import `sharedConfig`.
 * Alias của `nodeConfig`. Package mới dùng `nodeConfig` cho rõ ý định.
 */
export const sharedConfig: UserConfig = nodeConfig;

/**
 * Application/infra Node + Mongo. Test chạy trên DB staging DÙNG CHUNG → BẮT BUỘC
 * `setupFiles` trỏ `db-guard` tập trung (`./setup-db-guard`). KHÔNG hardcode `globalSetup` —
 * mỗi package tự khai báo vì turbo filter build-deps khác nhau theo tên package.
 *
 * Package dùng preset này PHẢI tuân `.cursor/rules/test-data-safety.mdc`.
 */
export const integrationConfig: UserConfig = {
  test: {
    ...nodeConfig.test,
    testTimeout: 30_000,
    setupFiles: ["@megawin/vitest-config/setup-db-guard"],
  },
};

/** UI (`@megawin/ui`) / Next.js (`backoffice`) — Vitest + React Testing Library + jsdom. */
export const jsdomConfig: UserConfig = {
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["@testing-library/jest-dom/vitest"],
    passWithNoTests: true,
  },
};
