# p0-04 — Hạ `packages/auth`, `packages/worker-core` về `nodeConfig`

## Bằng chứng

Cả 2 package đang khai `integrationConfig` (kéo theo build-deps + trước đây db-guard) nhưng test
file duy nhất của mỗi package tự ghi rõ đầu file:

- [`packages/auth/test/check-authorization.test.ts`](../../../packages/auth/test/check-authorization.test.ts):
  `/** PURE — không DB. Unit test cho checkAuthorization... Không verify token, không chạm DB. */`
- [`packages/worker-core/test/lock-taken-over-error.test.ts`](../../../packages/worker-core/test/lock-taken-over-error.test.ts):
  `/** PURE — không DB. Unit test cho LockTakenOverError... */`

`packages/auth/package.json` không có dependency `mongodb`/`redis`. Không có lý do kỹ thuật nào
để 2 package này chạy qua Testcontainers.

## Thay đổi

> **Thư mục:** Cả 2 file test đều pure (unit) — di chuyển vào `test/unit/` theo convention
> [`monorepo-test-setup/p2-01`](../monorepo-test-setup/p2-01-test-type-folder-convention.plan.md).
> `packages/auth/test/check-authorization.test.ts` → `packages/auth/test/unit/check-authorization.test.ts`,
> tương tự cho `worker-core`. Vì không có project `integration` (2 package này không chạm DB), preset
> đơn giản chỉ cần `nodeConfig` trực tiếp — không cần `test.projects` phức tạp.

`vitest.config.ts` mỗi package: đổi `integrationConfig` → `nodeConfig`, bỏ `globalSetup`,
`env: loadEnv(...)`, tham số `mode`; đổi `include` sang `test/unit/**`:

```typescript
import { nodeConfig } from "@megawin/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...nodeConfig,
  test: { ...nodeConfig.test, include: ["test/unit/**/*.test.ts"] },
});
```

Xoá `test/global-setup.ts` của cả 2 package (không cần build-deps qua globalSetup nữa — nếu build
order vẫn cần đảm bảo, dựa vào `turbo.json` `dependsOn: ["^build"]` sẵn có ở task `test`, không
cần global-setup riêng).

## Verify

- `pnpm --filter @megawin/auth test`, `pnpm --filter @megawin/worker-core test` — pass, không
  spawn Docker container nào (`docker ps` không có container mới).
- Nếu sau này 2 package này thêm test thật sự chạm Mongo/Redis → đổi lại `integrationConfig` +
  `globalSetup` phù hợp (xem [p0-01](p0-01-vitest-config-testcontainers.plan.md)).

## Không làm

- Không xoá `mongodb`/`redis` khỏi devDependencies gốc nếu có ở root — chỉ sửa 2 package này.
