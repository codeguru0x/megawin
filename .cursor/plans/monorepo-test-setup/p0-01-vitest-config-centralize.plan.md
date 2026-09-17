# p0-01 — Tập trung `@megawin/vitest-config`

> **SUPERSEDED (17/09/2026):** Runtime connection guard đã retire — integration test dùng
> Testcontainers (`testcontainers-setup/`). Không còn cơ chế mở khóa URI staging. Xem
> `.cursor/rules/test-data-safety.mdc` + `.cursor/plans/testcontainers-setup/`.

Nâng cấp package tooling `@megawin/vitest-config` thành NGUỒN CHÂN LÝ DUY NHẤT cho mọi cấu hình
test trong monorepo. Cung cấp 3 preset rõ ràng (`nodeConfig` / `integrationConfig` / `jsdomConfig`).
Phần runtime connection guard trong bản plan gốc đã retire — thay bằng Testcontainers.

## Vì sao

- Hiện `@megawin/vitest-config` chỉ export `sharedConfig` trần
  ([tooling/vitest-config/src/index.ts](../../../tooling/vitest-config/src/index.ts)):

```ts
export const sharedConfig = {
  test: { globals: true, environment: "node" },
};
```

- Preset integration trước đây gắn connection guard local per-package — đã tập trung rồi retire
  (xem `testcontainers-setup/`).

## Thay đổi

### 1. `tooling/vitest-config/src/index.ts` — export 3 preset

- `nodeConfig` — domain pure + workers: `environment: "node"`, `globals: true`, không setupFiles.
- `integrationConfig` — application Node+Mongo/Redis: kế thừa `nodeConfig` + `testTimeout: 30_000`.
  KHÔNG hardcode `globalSetup` — mỗi package tự khai `@megawin/vitest-config/global-setup-mongo`
  hoặc `global-setup-redis` (xem `testcontainers-setup/`).
- `jsdomConfig` — UI/Next.js: `environment: "jsdom"`, `globals: true`,
  `setupFiles: ["@testing-library/jest-dom/vitest"]`.

Giữ `sharedConfig` như alias của `nodeConfig` (backward-compat cho các config đang dùng).

### 2. `tooling/vitest-config/package.json` — subpath exports + deps

- Subpath exports cho `global-setup-mongo` / `global-setup-redis` (xem `testcontainers-setup/p0-01`).
- devDeps cho preset jsdom: `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `vite`.

### 3. Các package integration — dùng Testcontainers globalSetup

`game-*-application`, `cache`, `audit`, `identity-application`, …: `vitest.config.ts` dùng
`test.projects` (unit + integration) + `globalSetup` Mongo/Redis từ `@megawin/vitest-config`.

## Verify

- `pnpm --filter @megawin/vitest-config build`.
- `pnpm --filter @megawin/game-power655-application test` (đảm bảo preset mới không phá test cũ).
- GritQL / Cursor rule `test-data-safety.mdc` chặn `deleteMany({})` trong file test.

## Không làm

- Không đổi `turbo.json` (task `test` đã depend `@megawin/vitest-config#build`).
- Không đụng `.env*`.
