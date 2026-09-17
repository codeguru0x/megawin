# p0-01 — `tooling/vitest-config`: hạ tầng Testcontainers dùng chung

Tập trung logic Testcontainers vào `@megawin/vitest-config`, đúng triết lý đã chốt ở
[p0-01 cũ](../monorepo-test-setup/p0-01-vitest-config-centralize.plan.md) ("tập trung, không
copy-paste"). Xoá `setup-db-guard.ts` vì lý do tồn tại của nó biến mất (xem
[p0-05](p0-05-retire-runtime-db-guard.plan.md)).

## Thay đổi

### 1. `tooling/vitest-config/package.json`

- Thêm devDependency: `testcontainers`, `@testcontainers/mongodb`, `@testcontainers/redis`.
- Xoá export `"./setup-db-guard"`.
- Thêm export `"./global-setup-mongo"` → `dist/global-setup-mongo.js` (+ types).
- Thêm export `"./global-setup-redis"` → `dist/global-setup-redis.js` (+ types).
- Giữ `mongodb` như dependency thật (không còn "chỉ cho guard" — giờ dùng thật trong
  `mongo-container.ts` để gọi `getConnectionString()`/type). Thêm `redis` tương tự nếu cần type.

### 2. File mới `src/testcontainers/build-deps.ts`

Generic hoá phần "build workspace deps trước khi test" đang bị copy-paste 13 lần trong
`test/global-setup.ts` của từng package (hardcode tên package, VD
[game-power655-application/test/global-setup.ts](../../../packages/game-power655-application/test/global-setup.ts)
có literal `@megawin/game-power655-application^...`):

```typescript
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Build mọi workspace dependency của package đang chạy test (turbo `^...`).
 * Đọc tên package từ `package.json` của `process.cwd()` — generic cho MỌI
 * package gọi global-setup này, không hardcode tên như bản cũ per-package.
 */
export function buildWorkspaceDeps(): void {
  const pkgJsonPath = path.join(process.cwd(), "package.json");
  const { name } = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as { name: string };

  console.log(`[globalSetup] Building workspace dependencies for ${name}...`);
  // cwd() bên trong monorepo turbo đủ để turbo tự tìm root — không cần "../../" path math.
  execSync(`turbo build --filter=${name}^...`, { cwd: process.cwd(), stdio: "inherit" });
  console.log("[globalSetup] Dependencies built.");
}
```

### 3. File mới `src/testcontainers/mongo-container.ts`

```typescript
import { MongoDBContainer, type StartedMongoDBContainer } from "@testcontainers/mongodb";

let containerPromise: Promise<StartedMongoDBContainer> | undefined;

/**
 * Singleton Mongo container cho CẢ session `turbo run test` — mỗi package gọi hàm này
 * (qua global-setup riêng của process mình) đều `.withReuse()` cùng 1 label, Testcontainers
 * tự attach vào container đã chạy thay vì start container mới. Ryuk reaper dọn cuối session.
 *
 * Image version PHẢI khớp version MongoDB server thật đang chạy trên Atlas — kiểm tra
 * Atlas UI trước khi đổi tag này.
 */
export function getSharedMongoContainer(): Promise<StartedMongoDBContainer> {
  if (!containerPromise) {
    containerPromise = new MongoDBContainer("mongo:8.2").withReuse().start();
  }
  return containerPromise;
}
```

**Lưu ý bắt buộc khi ghép connection string:** `getConnectionString()` của module này KHÔNG kèm
`directConnection=true` (container chỉ có 1 node replica set `rs0`) — driver `mongodb` cần cờ này
để không cố discover topology qua node khác không tồn tại. Global-setup phải tự nối
`?directConnection=true` khi set env (xem mục 5).

### 4. File mới `src/testcontainers/redis-container.ts`

```typescript
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";

let containerPromise: Promise<StartedRedisContainer> | undefined;

/** Singleton Redis container, cùng cơ chế reuse như Mongo — xem mongo-container.ts. */
export function getSharedRedisContainer(): Promise<StartedRedisContainer> {
  if (!containerPromise) {
    containerPromise = new RedisContainer("redis:8").withReuse().start();
  }
  return containerPromise;
}
```

### 5. File mới `src/global-setup-mongo.ts`

```typescript
import { buildWorkspaceDeps } from "./testcontainers/build-deps";
import { getSharedMongoContainer } from "./testcontainers/mongo-container";

export async function setup(): Promise<void> {
  buildWorkspaceDeps();
  const container = await getSharedMongoContainer();
  process.env.MONGODB_URI = `${container.getConnectionString()}?directConnection=true`;
}

// KHÔNG `stop()` container ở teardown — package khác trong cùng `turbo run test` có thể
// vẫn đang dùng (reuse). Ryuk reaper của Testcontainers tự dọn cuối session/CI job.
```

### 6. File mới `src/global-setup-redis.ts`

```typescript
import { buildWorkspaceDeps } from "./testcontainers/build-deps";
import { getSharedRedisContainer } from "./testcontainers/redis-container";

export async function setup(): Promise<void> {
  buildWorkspaceDeps();
  const container = await getSharedRedisContainer();
  process.env.REDIS_URI = container.getConnectionUrl();
}

// Cùng lý do KHÔNG stop() — xem global-setup-mongo.ts.
```

### 7. Xoá `src/setup-db-guard.ts`

Xoá file + mọi tham chiếu (`package.json` export, `src/index.ts` nếu có import). Chi tiết lý do ở
[p0-05](p0-05-retire-runtime-db-guard.plan.md).

### 8. `src/index.ts` — `integrationConfig` gọn lại, KHÔNG bake `globalSetup`

Khác quyết định ban đầu (bake `globalSetup` Mongo cứng vào preset) — vì giờ có **2 backend**
(Mongo cho 13 package, Redis cho `cache`), preset chỉ giữ phần chung (`testTimeout`, kế thừa
`nodeConfig`), mỗi package tự khai `globalSetup` trỏ đúng module cần:

```typescript
export const integrationConfig: UserConfig = {
  test: {
    ...nodeConfig.test,
    testTimeout: 30_000,
    // KHÔNG còn setupFiles db-guard, KHÔNG còn globalSetup cứng — mỗi package tự khai
    // globalSetup phù hợp (xem p0-02, p0-03).
  },
};
```

> **Cách dùng 2 preset này trong 1 package** giờ qua `test.projects` (Vitest 5) — `nodeConfig` cho
> project `unit`, `integrationConfig` cho project `integration`, theo cấu trúc thư mục
> [`monorepo-test-setup/p2-01`](../monorepo-test-setup/p2-01-test-type-folder-convention.plan.md).
> Đi kèm 2 script chuẩn ở mỗi `package.json`: `"test:unit": "vitest run --project unit"`,
> `"test:integration": "vitest run --project integration"`, giữ `"test": "vitest run"` chạy cả
> hai (không đổi `turbo.json`).

## Verify

- `pnpm --filter @megawin/vitest-config build`.
- Test tay: viết 1 file scratch `vitest.config.ts` dùng `globalSetup: ["@megawin/vitest-config/global-setup-mongo"]`,
  chạy 1 test rỗng → xác nhận Docker container Mongo lên (`docker ps` thấy container mới), test
  pass, không có file `.env*` nào bị đọc.
- Chạy lại lần 2 → xác nhận KHÔNG có container Mongo mới (reuse hoạt động, `docker ps` vẫn 1
  container).
- Xoá file scratch sau khi verify.

## Không làm

- Không đổi `turbo.json`.
- Không tự `stop()` container trong teardown (xem lý do ở mục 5, 6).
