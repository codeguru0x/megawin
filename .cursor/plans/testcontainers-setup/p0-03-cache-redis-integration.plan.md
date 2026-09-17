# p0-03 — `packages/cache`: Testcontainers Redis + test mới cho `RedisCacheStore`/`RedisRepository`

Khác các package Mongo (di trú test cũ), đây là **thêm coverage mới**: `RedisCacheStore`
([src/stores/redis-store.ts](../../../packages/cache/src/stores/redis-store.ts)) và
`RedisRepository` ([src/redis/repository.ts](../../../packages/cache/src/redis/repository.ts))
hiện chưa có test nào — real hoặc mock. `test/stores.test.ts` chỉ cover
`MemoryCacheStore`/`NoopCacheStore`/`TieredCache`.

> **Thư mục:** viết thẳng theo convention
> [`monorepo-test-setup/p2-01`](../monorepo-test-setup/p2-01-test-type-folder-convention.plan.md)
> — 2 file test MỚI của phase này (`redis-repository.test.ts`, `redis-store.test.ts`) đặt tại
> `test/integration/` (chạm Redis thật). `test/stores.test.ts` hiện có (pure, `MemoryCacheStore`/
> `NoopCacheStore`) di chuyển sang `test/unit/` — cùng lúc với phase này, vì đằng nào cũng sửa
> `vitest.config.ts` sang `test.projects`.

## Thay đổi

### 1. `vitest.config.ts` — thêm project `integration` (Redis) bên cạnh `unit`

Trước:

```typescript
import { nodeConfig } from "@megawin/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...nodeConfig,
  test: { ...nodeConfig.test, include: ["test/**/*.test.ts"] },
});
```

Sau (dùng `test.projects` — xem
[`p2-01`](../monorepo-test-setup/p2-01-test-type-folder-convention.plan.md) cho cú pháp đầy đủ):

```typescript
import { integrationConfig, nodeConfig } from "@megawin/vitest-config/dist";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          ...nodeConfig.test,
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          ...integrationConfig.test,
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["@megawin/vitest-config/global-setup-redis"],
        },
      },
    ],
  },
});
```

`global-setup-redis.ts` set `process.env.REDIS_URI` — khớp
`DEFAULT_REDIS_ENV_KEY` ([src/constants.ts](../../../packages/cache/src/constants.ts)), nên
`getRedisClient()` ([src/redis/client.ts](../../../packages/cache/src/redis/client.ts)) hoạt động
không cần sửa gì.

### 2. Di chuyển `test/stores.test.ts` → `test/unit/stores.test.ts`

Chỉ đổi đường dẫn (và số lượng `../` trong import nếu có) — không sửa nội dung. File này pure
(`MemoryCacheStore`/`NoopCacheStore`/`TieredCache`), không chạm Redis.

### 3. File mới `test/integration/redis-repository.test.ts`

Cover các method cốt lõi của `RedisRepository` chưa từng được test:

```typescript
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { RedisRepository } from "../../src/redis/repository";
import getRedisClient from "../../src/redis/client";

const repo = new RedisRepository();

// Mỗi test dùng prefix riêng (test name) để không đụng key của test khác chạy
// song song trong cùng container — không cần "sentinel ID" như Mongo (test-data-safety.mdc)
// vì Redis flush theo key, không có filter rỗng nguy hiểm như deleteMany({}).
beforeEach(async () => {
  const client = await getRedisClient();
  await client.flushDb();
});

describe("RedisRepository — string/JSON", () => {
  it("setJson/getJson roundtrip", async () => {
    await repo.setJson("k1", { v: 42 }, 60);
    expect(await repo.getJson("k1")).toEqual({ v: 42 });
  });

  it("get key không tồn tại → null", async () => {
    expect(await repo.get("missing")).toBeNull();
  });

  it("set kèm TTL → key tự hết hạn", async () => {
    await repo.set("k1", "v1", 1);
    expect(await repo.ttl("k1")).toBeGreaterThan(0);
  });
});

describe("RedisRepository — counter/hash/set/sorted-set", () => {
  it("incrBy tăng atomic", async () => {
    expect(await repo.incrBy("counter", 5)).toBe(5);
    expect(await repo.incrBy("counter", 3)).toBe(8);
  });

  it("hIncrBy tăng field trong hash", async () => {
    expect(await repo.hIncrBy("h1", "f1", 2)).toBe(2);
  });

  it("sAdd + sIsMember", async () => {
    await repo.sAdd("set1", ["a", "b"]);
    expect(await repo.sIsMember("set1", "a")).toBe(true);
    expect(await repo.sIsMember("set1", "z")).toBe(false);
  });

  it("zAdd + zRangeWithScores", async () => {
    await repo.zAdd("z1", [{ score: 1, value: "a" }, { score: 2, value: "b" }]);
    expect(await repo.zRangeWithScores("z1", 0, -1)).toEqual([
      { score: 1, value: "a" },
      { score: 2, value: "b" },
    ]);
  });
});

describe("RedisRepository — deleteByPrefix (SCAN + DEL batch)", () => {
  it("chỉ xoá key match prefix", async () => {
    await repo.set("keno:config:v1", "a");
    await repo.set("keno:config:v1:t1", "b");
    await repo.set("mega645:config:v1", "c");
    await repo.deleteByPrefix("keno:config:v1");
    expect(await repo.exists("keno:config:v1")).toBe(false);
    expect(await repo.exists("keno:config:v1:t1")).toBe(false);
    expect(await repo.exists("mega645:config:v1")).toBe(true);
  });
});
```

### 4. File mới `test/integration/redis-store.test.ts`

Cover `RedisCacheStore` — đặc biệt phần **fail-open** (khác `RedisRepository` throw thẳng) và
`Date` round-trip qua `json-date-codec.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";

import { RedisCacheStore } from "../../src/stores/redis-store";
import getRedisClient from "../../src/redis/client";

const store = new RedisCacheStore();

beforeEach(async () => {
  const client = await getRedisClient();
  await client.flushDb();
});

describe("RedisCacheStore", () => {
  it("set/get roundtrip", async () => {
    await store.set("k1", { v: 42 }, 60);
    expect(await store.get("k1")).toEqual({ v: 42 });
  });

  it("Date field không bị JSON làm mất kiểu (json-date-codec)", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    await store.set("k1", { createdAt: now }, 60);
    const result = await store.get<{ createdAt: Date }>("k1");
    expect(result?.createdAt).toBeInstanceOf(Date);
    expect(result?.createdAt.toISOString()).toBe(now.toISOString());
  });

  it("ttlSec <= 0 → không ghi (no-op)", async () => {
    await store.set("k1", { v: 1 }, 0);
    expect(await store.get("k1")).toBeUndefined();
  });

  it("delete xoá key", async () => {
    await store.set("k1", { v: 1 }, 60);
    await store.delete("k1");
    expect(await store.get("k1")).toBeUndefined();
  });

  it("deleteByPrefix chỉ xoá key match prefix", async () => {
    await store.set("keno:config:v1", { v: 1 }, 60);
    await store.set("mega645:config:v1", { v: 2 }, 60);
    await store.deleteByPrefix("keno:config:v1");
    expect(await store.get("keno:config:v1")).toBeUndefined();
    expect(await store.get("mega645:config:v1")).toEqual({ v: 2 });
  });
});
```

**Ghi chú:** test "fail-open khi Redis down" (get/set không throw khi mất connection) khó dựng
đáng tin cậy với Testcontainers đang chạy khoẻ mạnh — nếu cần cover case này, gọi
`container.stop()` giữa bài rồi assert không throw (thêm sau, không block phase này).

## Verify

- `pnpm --filter @megawin/cache test:integration` — xác nhận container Redis tự start, test mới
  (`redis-repository.test.ts`, `redis-store.test.ts`) pass.
- `pnpm --filter @megawin/cache test:unit` — pass, **không spawn container Redis** (`docker ps`
  không tăng) — xác nhận `stores.test.ts` (đã di chuyển) không phụ thuộc Testcontainers.
- Đảm bảo `flushDb()` trong `beforeEach` của `test/integration/` không ảnh hưởng
  `test/unit/stores.test.ts` (dùng `MemoryCacheStore` — không chạm Redis thật) — 2 project độc
  lập, không share state ngoài container.

## Không làm

- Không viết test cho case "Redis down giữa chừng" ở phase này (ghi chú để làm sau).
- Không thêm multi-instance Redis (rate-limit/leaderboard env key riêng) — chưa có nhu cầu thật.
