# 03 — Thiết Kế Package `@megawin/cache`

> Thiết kế chi tiết package base — layered cache (L1 memory + L2 Redis) theo interface, để consumer swap backend không sửa code.

## 1. Nguyên tắc thiết kế

1. **Interface-first**: consumer chỉ phụ thuộc `CacheStore` / `createCachedFetcher`, không biết backend là memory hay Redis. Chọn/đổi backend là quyết định composition tại app bootstrap.
2. **Fail-open**: cache lỗi (Redis down, serialize fail) → log + fallthrough về loader (DB). Cache là optimization, **không bao giờ** là hard dependency trên hot path.
3. **TTL là chiến lược nền tảng, invalidation là bonus**: vì Lambda multi-container không share memory, mọi thiết kế phải đúng khi *chỉ có TTL*. Invalidation chủ động (khi có) chỉ làm giảm độ trễ, không phải điều kiện đúng đắn.
4. **Stampede protection**: dedup concurrent loads cùng key trong 1 process (single-flight) — pattern đã có sẵn ở `tenant-gateway` qua `lru-cache` `fetchMethod`.
5. **Chèn cache tại internal use-case chokepoint** (`get-global-config-internal`, `get-tenant-config-internal`...), không chèn ở handler (trùng lặp per-endpoint) và không chèn ở repo (repo phải là raw data access thuần).
6. **Giữ nguyên `RedisRepository` hiện có** cho các use case Redis-specific tương lai (counter, set, hash, lock) — `RedisCacheStore` là adapter mỏng phía trên.

## 2. Cấu trúc package đề xuất

```
packages/cache/
├── package.json              # bổ sung exports subpaths + barrel (theo convention repo)
├── src/
│   ├── index.ts              # barrel: types + factories
│   ├── types.ts              # CacheStore, CacheEntryOptions, CachedFetcher...
│   ├── keys.ts               # cacheKey() helper + namespace convention
│   ├── stores/
│   │   ├── index.ts
│   │   ├── memory-store.ts   # MemoryCacheStore — lru-cache wrapper (L1)
│   │   ├── redis-store.ts    # RedisCacheStore — adapter trên RedisRepository (L2)
│   │   ├── tiered-store.ts   # TieredCache — L1 → L2 composite
│   │   └── noop-store.ts     # NoopCacheStore — tắt cache (test/dev)
│   ├── cached-fetcher.ts     # createCachedFetcher — read-through + single-flight + negative cache
│   └── redis/                # GIỮ NGUYÊN code hiện có
│       ├── client.ts
│       └── repository.ts
```

`package.json` chuẩn hoá theo convention repo (`types`/`import` → `src`, `default` → `dist`):

```json
{
  "name": "@megawin/cache",
  "exports": {
    ".": { "types": "./src/index.ts", "import": "./src/index.ts", "default": "./dist/index.js" },
    "./stores": { "types": "./src/stores/index.ts", "import": "./src/stores/index.ts", "default": "./dist/stores/index.js" },
    "./redis": { "types": "./src/redis/index.ts", "import": "./src/redis/index.ts", "default": "./dist/redis/index.js" }
  },
  "dependencies": {
    "@megawin/shared": "workspace:*",
    "lru-cache": "^11.3.3",
    "redis": "^5.10.0"
  }
}
```

## 3. Interface cốt lõi

```typescript
// src/types.ts

/**
 * Contract chung cho mọi cache backend (memory / Redis / tiered / noop).
 *
 * Mọi method PHẢI fail-open: backend lỗi → không throw ra consumer,
 * get trả undefined, set/delete nuốt lỗi + log.
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  /** ttlSec bắt buộc — không cho phép key sống vô hạn. */
  set<T>(key: string, value: T, ttlSec: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Xoá theo prefix — memory: scan keys; Redis: SCAN + DEL (không dùng KEYS). */
  deleteByPrefix(prefix: string): Promise<void>;
}

export interface CachedFetcherOptions<T> {
  store: CacheStore;
  /** Namespace + version cho key. VD: "keno:global-config:v1" */
  keyPrefix: string;
  ttlSec: number;
  /** Cache cả kết quả null/undefined (negative caching) — mặc định true, TTL riêng ngắn hơn. */
  negativeTtlSec?: number;
}
```

```typescript
// src/cached-fetcher.ts

/**
 * Read-through cache wrapper — pattern chuẩn cho mọi hot lookup.
 *
 * - Single-flight: concurrent calls cùng key trong 1 process chỉ chạy loader 1 lần.
 * - Fail-open: store lỗi → gọi thẳng loader.
 * - Cache miss → load từ source; source lỗi → throw (L2 Redis là lớp chịu lỗi khi DB down).
 */
export function createCachedFetcher<TArgs extends string, TResult>(
  loader: (key: TArgs) => Promise<TResult>,
  options: CachedFetcherOptions<TResult>
): (key: TArgs) => Promise<TResult>;
```

### 3.1. `MemoryCacheStore` (L1)

Wrapper mỏng trên `lru-cache` — tái dùng đúng pattern `tenant-gateway` đã kiểm chứng:

```typescript
// Ví dụ usage — L1 thuần cho GameConfig
const configCache = new MemoryCacheStore({ max: 100 });
```

- `max` bắt buộc (bound memory — quan trọng với backoffice long-running).
- TTL per-entry qua `set(key, value, ttlSec)`.
- Đồng bộ nội bộ nhưng expose async interface để đồng nhất với Redis.

### 3.2. `RedisCacheStore` (L2)

Adapter trên `RedisRepository` hiện có (`cache`/`getCache`/`deleteCache` đã đúng JSON + EX semantics). Bổ sung:

- try/catch toàn bộ → fail-open (RedisRepository hiện tại throw khi connect fail).
- Timeout ngắn cho command (100–300ms) — cache chậm hơn DB thì vô nghĩa.
- `deleteByPrefix` dùng `SCAN` + batch `DEL` (không dùng `KEYS` — block Redis).

### 3.3. `TieredCache` (L1 → L2)

```typescript
/**
 * get: L1 hit → trả ngay. L1 miss → L2. L2 hit → backfill L1 (TTL ngắn hơn) → trả.
 * set: ghi cả 2 tầng. delete: xoá cả 2 (L1 chỉ trong process hiện tại —
 * containers khác dựa vào TTL L1 ngắn để tự hết hạn).
 */
new TieredCache({ l1: memoryStore, l2: redisStore, l1TtlSec: 10 });
```

Quy tắc TTL tiered: **L1 TTL ≤ L2 TTL / 3** — L1 chỉ là "đệm chống lặp trong container", L2 là source of truth của cache. Khi invalidate qua L2 (delete key), mọi container sẽ thấy giá trị mới trễ tối đa `l1TtlSec` — đây là cận trên staleness rõ ràng, dễ reasoning.

### 3.4. `NoopCacheStore`

`get` luôn miss, `set/delete` no-op — dùng cho unit test và tắt cache qua env (`CACHE_DISABLED=true`) khi debug production issue.

## 4. Key convention

```typescript
// src/keys.ts
/** cacheKey("keno", "global-config", "v1") → "keno:global-config:v1" */
export function cacheKey(...parts: string[]): string;
```

| Thành phần | Quy tắc | Ví dụ |
|---|---|---|
| Namespace | `{gameKey}` hoặc `{domain}` | `keno`, `identity`, `tenant-gw` |
| Entity | tên dữ liệu | `global-config`, `tenant-config`, `tenant-by-apikey` |
| Version | `v{n}` — bump khi đổi shape để tránh deserialize sai sau deploy | `v1` |
| Discriminator | id cụ thể (nếu có) | `{tenantId}`, `{drawId}` |

Ví dụ đầy đủ: `keno:tenant-config:v1:tenant_abc`, `identity:tenant-by-apikey:v1:{hash(apiKey)}`.

⚠️ **Không đặt raw apiKey vào key** — key xuất hiện trong log/monitoring Redis. Hash (sha256 truncate) trước khi làm key.

## 5. Composition tại consumer

Consumer package (game-*-application) nhận `CacheStore` qua constructor/factory — đúng tinh thần layering hiện tại (use-case nhận repo qua DI):

```typescript
// packages/game-keno-application/src/use-cases/game-config/get-global-config-internal.ts
// Chỗ cắm đã có sẵn TODO — chỉ wrap loader hiện tại:

const getGlobalConfigCached = createCachedFetcher(
  () => gameConfigRepo.getGlobalConfig(),
  {
    store: defaultCacheStore, // MemoryCacheStore ở Phase 1, TieredCache ở Phase 3
    keyPrefix: cacheKey("keno", "global-config", "v1"),
    ttlSec: 60,
  }
);
```

App bootstrap quyết định store (qua env, không đổi code use-case):

```typescript
// Phase 1: memory-only (mặc định, không cần env gì)
// Phase 3: REDIS_URI có mặt → tự nâng cấp thành TieredCache
export function createDefaultCacheStore(): CacheStore {
  const l1 = new MemoryCacheStore({ max: 500 });
  if (!process.env.REDIS_URI) return l1;
  return new TieredCache({ l1, l2: new RedisCacheStore("REDIS_URI"), l1TtlSec: 10 });
}
```

## 6. Invalidation design

| Cơ chế | Phase | Mô tả |
|---|---|---|
| **TTL** (nền tảng) | 1 | Mọi key có TTL. Staleness bound = TTL (memory-only) hoặc `l1TtlSec` (tiered). |
| **Same-process delete** | 1 | Update use-case gọi `store.delete(key)` — có tác dụng ngay trong backoffice (nơi update xảy ra), Lambda khác chờ TTL. |
| **L2 delete** | 3 | Update use-case delete key trên Redis → mọi container thấy sau ≤ `l1TtlSec`. |
| **Pub/sub broadcast** | chỉ khi cần | Redis pub/sub để clear L1 tức thời cross-process. Chỉ xây khi có yêu cầu nghiệp vụ "khoá tức thời" thật sự — YAGNI cho hiện tại. |

**Quy tắc bắt buộc cho mọi update use-case có cache tương ứng**: sau khi ghi DB thành công, gọi delete cache key (fire-and-forget, fail-open). Danh sách cụ thể ở [04](./04-ap-dung-use-case-va-roadmap.md).

## 7. Observability

- Log (debug level) cache hit/miss/error kèm `keyPrefix` — đủ để tính hit-rate từ CloudWatch Logs Insights, không cần metric infra riêng ở Phase 1.
- Nếu hit-rate < 80% cho 1 keyPrefix → TTL quá ngắn hoặc key cardinality quá cao — review lại.
- Redis (Phase 3): CloudWatch metrics có sẵn (ElastiCache) hoặc console Upstash.

## 8. Testing

- Unit test use-case dùng `NoopCacheStore` (mặc định trong test setup) — hành vi giống không có cache.
- Test cache behavior riêng cho `cached-fetcher` (single-flight, negative caching, loader-error) trong `packages/cache` — 1 lần, mọi consumer hưởng.
- Integration test invalidation: update use-case → get trả giá trị mới (với MemoryCacheStore cùng process).
