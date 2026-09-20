# p0-01 — `@megawin/guard` Foundation

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md`
> Overview: `./00-overview.md` · Phase P0 · Chặn: mọi plan khác

Dựng package `@megawin/guard` + primitive Redis còn thiếu. Plan này **không** hook vào handler nào và
**không** đổi hành vi runtime của hệ thống — chỉ tạo công cụ. Kết thúc plan: có `checkRateLimit()`
chạy được, test xanh, chưa ai gọi.

## Mục tiêu

1. `RedisRepository` chạy được Lua script (`EVAL`/`EVALSHA`) — hiện **không có** method nào.
2. Package `@megawin/guard` với GCRA rate limiter, adapter **fail-open** timeout ngắn.
3. Test đầy đủ: unit (logic thuần) + integration (Redis thật).

## Hiện trạng cần biết trước khi sửa

| Sự thật đã verify | Vị trí |
|---|---|
| `RedisRepository` có `get/set/incrBy/hIncrBy/zAdd/multi/...` nhưng **không** `eval`/`evalSha`/`scriptLoad` | `packages/cache/src/redis/repository.ts` (398 dòng) |
| `redis@6.2.1` **có đủ** `EVAL`, `EVALSHA`, `SCRIPT_LOAD`; `EvalOptions = { keys?, arguments? }`, reply `ReplyUnion` | `node_modules/.pnpm/@redis+client@6.2.1/.../commands/EVAL.d.ts` |
| Type Redis suy từ signature thật, **không** hard-code shape | `packages/cache/src/redis/types.ts` (JSDoc đầu file) |
| `RedisRepository` **fail-fast** (throw); `RedisCacheStore` là adapter **fail-open** | `repository.ts:7-10` JSDoc |
| Timeout hot path hiện tại 300ms | `packages/cache/src/constants.ts` → `DEFAULT_REDIS_COMMAND_TIMEOUT_MS` |
| Namespace phải đăng ký tập trung, **không** hard-code chuỗi | `packages/cache/src/namespaces.ts` + `cache-design.mdc` §2.1 |
| Redis integration test đã có hạ tầng sẵn (`global-setup-redis`, `fileParallelism: false`) | `packages/cache/vitest.config.ts` |

## Bước 1 — Bổ sung script primitive vào `RedisRepository`

File: `packages/cache/src/redis/repository.ts` (thêm section mới `── Scripting ──` **cuối class**,
trước hoặc sau `── Transaction ──`).

Thêm 3 method, JSDoc đầy đủ theo chuẩn `code-quality-standards.mdc` §1–2:

```ts
/** EVAL — chạy Lua script (gửi full script mỗi lần). Dùng khi chưa cache SHA. */
public async eval(script: string, keys: string[], args: string[]): Promise<unknown>

/** EVALSHA — chạy script đã nạp theo SHA1. Throw `NOSCRIPT` nếu Redis chưa có script. */
public async evalSha(sha: string, keys: string[], args: string[]): Promise<unknown>

/** SCRIPT LOAD — nạp script, trả SHA1 để dùng với `evalSha`. */
public async scriptLoad(script: string): Promise<string>
```

Ràng buộc bắt buộc:

- **Type**: `keys`/`args` là `string[]`; reply là `unknown` — caller tự narrow. **KHÔNG** khai
  `Promise<any>` (vi phạm `.oxlintrc.json`: `any` chỉ được ở `*-application/src/infras/**` + test).
  **KHÔNG** hard-code shape reply của redis — nếu cần type, suy từ signature như `types.ts` đang làm.
- Tất cả nhận `commandOptions?: RedisCommandOptions` như các method khác (để truyền timeout ngắn).
- Giữ đúng **fail-fast** — không try/catch, không nuốt lỗi. Fail-open là việc của adapter ở Bước 3.
- Method đặt tên bám lệnh Redis gốc (convention đã ghi ở `repository.ts:4-6`).

Export: `eval` là **reserved word** trong một số ngữ cảnh — kiểm tra `oxlint` không cảnh báo; nếu có,
đặt `evalScript` và ghi rõ lý do trong JSDoc (đây là ngoại lệ hợp lệ của convention đặt tên).

## Bước 2 — Đăng ký namespace

File: `packages/cache/src/namespaces.ts` — thêm **1 dòng** vào `CacheNamespace`:

```ts
  /** Lớp phòng thủ (rate limit, idempotency) — KHÔNG phải cache, shared state phải đúng. */
  Guard: "guard",
```

Không sửa gì khác trong `packages/cache` ngoài Bước 1 + 2.

## Bước 3 — Tạo package `packages/guard`

### 3.1. Scaffold

Theo `oxlint-lint-conventions.mdc` §a: **không** tạo `.oxlintrc*`/`.prettierrc*` riêng, **không** thêm
script `lint`. Copy khuôn từ `packages/cache`:

- `package.json` — name `@megawin/guard`, `type: "module"`, `private: true`.
  - `exports`: `"."`, `"./rate-limit"`, `"./middleware"` — mỗi subpath `types`/`import` → `src`,
    `default` → `dist` (đúng pattern `packages/cache/package.json`).
  - `dependencies`: `@megawin/cache`, `@megawin/shared` (workspace). **Không** thêm dep ngoài.
  - `devDependencies` + `scripts` (`build`, `check-types`, `test:unit`, `test:integration`): copy
    nguyên từ `packages/cache`.
- `tsconfig.json` + `tsconfig.build.json` — copy nguyên `packages/cache` (rootDir/outDir giống).
- `vitest.config.ts` — copy `packages/cache/vitest.config.ts` (giữ `globalSetup` redis +
  `fileParallelism: false` cho integration).

### 3.2. Cấu trúc source

```
packages/guard/src/
├── constants.ts              # timeout, default window/limit, TTL — 1 nguồn sự thật
├── keys.ts                   # GUARD_KEYS = { rateLimit: cacheKey(CacheNamespace.Guard, "rl", "v1") }
├── types.ts                  # RateLimitDecision, RateLimitRule, GuardSubject
├── rate-limit/
│   ├── gcra.lua.ts           # Lua script dạng string const + JSDoc giải thích từng ARGV
│   ├── gcra-math.ts          # tính emissionInterval/delayTolerance từ rule (PURE, test được)
│   ├── rate-limiter.ts       # RateLimiter class — EVALSHA + fallback NOSCRIPT, fail-open
│   └── index.ts
└── index.ts
```

Vì sao tách `gcra-math.ts` khỏi `rate-limiter.ts`: phần toán (`windowSec`+`limit`+`burst` →
`emissionIntervalMs`/`delayToleranceMs`) là **pure function** → unit test không cần Redis. Phần còn
lại chỉ là I/O. Đây là chỗ bug ngưỡng dễ lọt nhất nên phải test được rẻ.

### 3.3. Lua GCRA

Script: dùng bản phác thảo ở analysis §7.1. Yêu cầu bắt buộc:

- `now_ms` truyền **từ Lambda qua ARGV**, **KHÔNG** dùng `TIME` của Redis — giữ script
  deterministic (`EVAL` với `TIME` bị Redis coi là non-deterministic ở một số version/replica config).
  Ghi rõ đánh đổi (clock skew giữa Lambda, không đáng kể ở thang phút) bằng comment trong file.
- Trả `{ allowed, retryAfterMs, remainingBurst }` — mảng 3 số.
- TTL `PX` tự tính từ `new_tat - now + dt` → key tự hết hạn, **không** cần cleanup job.
- Mỗi `ARGV[n]` có 1 dòng comment nói rõ đơn vị (ms) — đây là chỗ dễ sai đơn vị nhất.

### 3.4. `RateLimiter` — fail-open là yêu cầu chức năng, không phải "nice to have"

```ts
/** Quyết định cho 1 request. `failedOpen: true` = Redis lỗi, đã CHO QUA. */
export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs: number;
  remainingBurst: number;
  /** true khi Redis lỗi/timeout và guard chủ động cho qua — caller PHẢI đếm metric này. */
  failedOpen: boolean;
}
```

Hành vi bắt buộc:

- Redis lỗi/timeout → trả `{ allowed: true, failedOpen: true }` + `logError(...)`. **Tuyệt đối không
  throw.** Lý do (analysis §3.4): rate limit là *phòng thủ*, không phải *correctness*; chặn hết traffic
  thật để ngăn abuse giả định là tự gây sự cố.
- Timeout **100ms** (hằng số trong `constants.ts`, JSDoc giải thích: chặn chậm hơn 100ms thì thà cho
  qua; ngắn hơn `DEFAULT_REDIS_COMMAND_TIMEOUT_MS`=300ms của cache vì cache miss còn phải đi DB, còn
  rate limit chỉ cần quyết định nhanh). Truyền qua `commandOptions` của Bước 1.
- `EVALSHA` trước; bắt lỗi `NOSCRIPT` → `EVAL` full script rồi cache SHA ở scope module. Cache SHA
  per-process giống `__redisClientCache__` (`packages/cache/src/redis/client.ts:19`).
- **Không** dùng `getDefaultCacheStore()` — đó là cache fail-open cho *dữ liệu*, còn đây cần chạy
  *script*. Extend `RedisRepository` trực tiếp (đúng như JSDoc `repository.ts:12-17` hướng dẫn).
- Nhận `redisEnvKey` optional (mặc định `DEFAULT_REDIS_ENV_KEY`) → chừa đường tách instance
  `REDIS_RATELIMIT_URI` sau (analysis §5.3) mà không phải refactor.

### 3.5. Subject & key

```ts
export const GuardSubjectType = { Account: "account", Tenant: "tenant", Ip: "ip" } as const;
export type GuardSubjectType = (typeof GuardSubjectType)[keyof typeof GuardSubjectType];
```

`const object as const` — **không** union string literal trần (`code-quality-standards.mdc` §5.3).

Key: `guard:rl:v1:{route}:{subjectType}_{subjectId}`

- Build qua `GUARD_KEYS.rateLimit` + phần động ghép runtime (**không** `cacheKey()` inline —
  `cache-design.mdc` §2.2).
- Nối phần động bằng `_`, **không** bằng `:` (phá phân tầng key).
- `subjectId` là IP hoặc `accountId` → **`hashKeyPart()`** vì là dữ liệu do client ảnh hưởng và key
  lộ trong log/monitoring Redis (`packages/cache/src/keys.ts` JSDoc cảnh báo rõ).
- `route` là hằng do **developer** khai (`"keno.place-bet"`), không lấy từ request → không cần hash,
  và giữ key đọc được khi debug.

## Bước 4 — Test

### Unit (`test/unit/`, không cần Redis)

- `gcra-math.test.ts`: `limit`/`windowSec`/`burst` → `emissionIntervalMs`/`delayToleranceMs`. Có
  case `burst: 0`, `limit: 1`, và **vector cố định** để đổi công thức là test đỏ.
- `keys.test.ts`: key đúng format; phần động **không** chứa `:`; `subjectId` đã hash.

### Integration (`test/integration/`, Redis thật)

- Trong burst → tất cả `allowed: true`; vượt → `allowed: false` kèm `retryAfterMs > 0`.
- Sau khi chờ `retryAfterMs` → `allowed: true` lại (chứng minh leak/refill hoạt động).
- **Fail-open**: trỏ `redisEnvKey` sang env URI sai → `{ allowed: true, failedOpen: true }`,
  **không throw**. Đây là test quan trọng nhất của plan.
- Key tự hết TTL (kiểm tra `ttl` > 0 và key biến mất sau đó).
- `flushDb()` trong `beforeEach` (bắt buộc — xem comment `packages/cache/vitest.config.ts`).

## Definition of done

- [ ] `RedisRepository` có `eval`/`evalSha`/`scriptLoad`, JSDoc đầy đủ, vẫn fail-fast, không `any`.
- [ ] `CacheNamespace.Guard` đã thêm (1 dòng, có JSDoc).
- [ ] `packages/guard` build được: `pnpm --filter @megawin/guard build` + `check-types` xanh.
- [ ] `pnpm --filter @megawin/guard test:unit` xanh; `test:integration` xanh với Redis local.
- [ ] `pnpm --filter @megawin/cache test` **vẫn xanh** (không regress).
- [ ] `oxlint packages/guard packages/cache` không error; `prettier --write` đã chạy.
- [ ] **Chưa có handler nào import `@megawin/guard`** — plan này không đổi hành vi runtime.

## Không làm trong plan này (chống scope creep)

- ❌ Hook vào `buildHandler` → `p1-01`.
- ❌ Idempotency → `p0-02`.
- ❌ Metrics/alert → `p2-01`.
- ❌ Thêm `REDIS_RATELIMIT_URI` vào SSM/serverless.yml — MVP dùng chung `REDIS_URI` (analysis §5.3).
- ❌ Sửa `apps/*/serverless.yml`.
