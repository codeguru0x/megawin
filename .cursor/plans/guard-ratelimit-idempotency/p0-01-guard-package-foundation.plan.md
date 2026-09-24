---
name: ""
overview: ""
todos: []
isProject: false
---

# p0-01 — `@megawin/guard` Foundation

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md`
> Overview: `./00-overview.md` · Phase P0 · **Chặn bởi: `p0-00`** · Chặn: mọi plan khác

Dựng package `@megawin/guard` + primitive Redis còn thiếu. Plan này **không** hook vào handler nào và
**không** đổi hành vi runtime của hệ thống — chỉ tạo công cụ. Kết thúc plan: có `checkRateLimit()`
chạy được, test xanh, chưa ai gọi.

⚠️ **Không bắt đầu plan này trước khi `p0-00` xong cả Code và Test.** `RateLimiter` ở Bước 3.4 hứa
"Redis lỗi → `{allowed: true, failedOpen: true}`". Trên code trước `p0-00`, lời hứa đó **không thực
hiện được**: `getClient()` treo (retry vô hạn) nên không bao giờ tới `try/catch`. Làm trước sẽ ra test
fail-open **xanh giả** — chỉ xanh vì test dùng URI sai cú pháp, không phải Redis không tới được.

## Mục tiêu

1. `RedisRepository` chạy được Lua script (`EVAL`/`EVALSHA`) — hiện **không có** method nào.
2. Package `@megawin/guard` với GCRA rate limiter, adapter **fail-open** timeout ngắn.
3. Test đầy đủ: unit (logic thuần) + integration (Redis thật).

## Vì sao phải là Lua, không phải lệnh native

Redis **8.6** (version prod) **không có** lệnh rate limit native nào. Đã verify 2026-09-21:

- Lệnh `GCRA key max_burst requests_per_period period` từng được implement (PR #14826, dựa trên module
  `redis-cell`) và có mặt ở **8.8-M02**, nhưng **bị rút trước GA** (PR #15191 — code compile out sau
  `-DENABLE_GCRA`, command inaccessible, AOF/RDB disabled).
- 8.8 GA chỉ có `INCREX` (window counter, **không** phải GCRA). 8.10 không thêm gì về rate limit.
- `CL.THROTTLE` là lệnh của module `redis-cell` (Rust), **không** bundle trong image `redis` official —
  dùng được thì phải tự build image, thêm một thứ phải vận hành.

→ Lua `EVAL` là lựa chọn **duy nhất**, không phải giải pháp tạm. Bước B0 xác nhận lại bằng
`COMMAND INFO` trên container thật.

## Hiện trạng cần biết trước khi sửa

| Sự thật đã verify | Vị trí |
|---|---|
| `RedisRepository` có `get/set/incrBy/hIncrBy/zAdd/multi/...` nhưng **không** `eval`/`evalSha`/`scriptLoad` | `packages/cache/src/redis/repository.ts` (398 dòng) |
| `redis@6.2.1` **có đủ** `EVAL`, `EVALSHA`, `SCRIPT_LOAD`; `EvalOptions = { keys?, arguments? }`, reply `ReplyUnion` | `node_modules/.pnpm/@redis+client@6.2.1/.../commands/EVAL.d.ts` |
| Type Redis suy từ signature thật, **không** hard-code shape | `packages/cache/src/redis/types.ts` (JSDoc đầu file) |
| `RedisRepository` **fail-fast** (throw); `RedisCacheStore` là adapter **fail-open** | `repository.ts:7-10` JSDoc |
| Timeout hot path hiện tại 300ms | `packages/cache/src/constants.ts` → `DEFAULT_REDIS_COMMAND_TIMEOUT_MS` |
| Sau `p0-00`: có `DEFAULT_REDIS_CONNECT_*` + `REDIS_CIRCUIT_OPEN_MS`, `withDeadline`, circuit inline trong `getRedisClient`, và **mọi** method repo nhận `commandOptions` | `packages/cache/src/constants.ts`, `src/redis/client.ts`, `src/redis/with-deadline.ts` |
| Namespace phải đăng ký tập trung, **không** hard-code chuỗi | `packages/cache/src/namespaces.ts` + `cache-design.mdc` §2.1 |
| Redis integration test đã có hạ tầng sẵn (`global-setup-redis`, `fileParallelism: false`) | `packages/cache/vitest.config.ts` |
| Image test đã pin `redis:8.6` ở `p0-00` B0.1 | `tooling/vitest-config/src/testcontainers/redis-container.ts` |

---

# PHẦN A — CODE (AI agent implement)

> Chỉ code production. **Không** viết test trong Phần A. Kết thúc Phần A:
> `pnpm --filter @megawin/guard check-types` + `pnpm --filter @megawin/cache check-types` xanh,
> `oxlint` không error. Sang Phần B mới viết test; test đỏ → quay lại đây, ghi `A-fix: <lý do>`.

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

---

# PHẦN B — TEST (viết SAU khi Phần A xong)

> Không sửa `src/` ở Phần B. Test đỏ = Phần A sai. Không `skip`/`todo` bất kỳ test nào.

## B0 — Xác nhận môi trường trước khi viết test

| # | Việc | Kỳ vọng | Nếu sai thì sao |
|---|---|---|---|
| 0a | `docker info` | Daemon đang chạy | Dừng — Phần B không chạy được (lúc lập plan 2026-09-21 daemon **không** chạy) |
| 0b | `docker exec <c> redis-cli INFO server \| grep redis_version` | `8.6.x` | Dừng — `p0-00` B0.1 chưa xong, mọi kết luận test vô nghĩa |
| 0c | `docker exec <c> redis-cli COMMAND INFO GCRA INCREX CL.THROTTLE` | **cả 3 nil** | Nếu có lệnh nào → giả định nền của plan sai, báo lại trước khi viết Lua |
| 0d | `docker exec <c> redis-cli EVAL "return 1" 0` | `1` | Lua bị tắt (`lua-time-limit`/ACL) → toàn bộ thiết kế không chạy được, phải báo |

Ghi kết quả 0b + 0c vào phần ghi chú thực thi — đây là bằng chứng "dùng Lua là đúng", không phải suy đoán.

## B1 — Unit test (PURE, không Redis, không Docker)

`packages/guard/test/unit/` · `pnpm --filter @megawin/guard test:unit`

### `gcra-math.test.ts`

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 1 | `{limit: 30, windowSec: 60}` → `emissionIntervalMs = 2000` | So số tuyệt đối | Vector cố định: đổi công thức = test đỏ |
| 2 | `{limit: 30, windowSec: 60, burst: 5}` → `delayToleranceMs = 10000` | `burst × emissionInterval` | Bug đơn vị (s vs ms) là lỗi dễ mắc nhất |
| 3 | `burst: 0` → `delayToleranceMs = 0` | `toBe(0)` | Biên: không burst = spacing tuyệt đối |
| 4 | `limit: 1, windowSec: 1` → `emissionIntervalMs = 1000` | Giá trị nhỏ nhất hợp lệ | Biên dưới |
| 5 | `limit: 0` hoặc `windowSec: 0` → **throw** | `toThrow()` | Chia cho 0 phải chặn lúc cấu hình, không trả `Infinity` xuống Lua |
| 6 | Kết quả luôn là **số nguyên** ms | `Number.isInteger()` | Lua nhận ARGV dạng string; số thập phân gây lệch âm thầm |

### `keys.test.ts`

| # | Test | Cách xác nhận PASS |
|---|---|---|
| 7 | Key khớp `guard:rl:v1:<route>:<type>_<hash>` | Regex, không so chuỗi cứng toàn bộ |
| 8 | Phần động **không** chứa `:` | `expect(dynamic).not.toContain(":")` — `:` phá phân tầng key |
| 9 | `subjectId` đã qua `hashKeyPart()` | Key **không** chứa IP/accountId nguyên bản (`not.toContain(rawIp)`) — key lộ trong log Redis |
| 10 | 2 `subjectId` khác → 2 key khác; cùng `subjectId` → **cùng** key | Tất định, không collision |
| 11 | `route` giữ **nguyên văn** (không hash) | `toContain("keno.place-bet")` — phải đọc được khi debug |

### `lua-script.test.ts`

| # | Test | Cách xác nhận PASS |
|---|---|---|
| 12 | Script là string không rỗng, **không** chứa `TIME` | `not.toMatch(/\bTIME\b/)` — khoá quyết định "now_ms từ ARGV" ở Bước 3.3 |
| 13 | Số `ARGV[n]` script đọc **khớp** số arg `RateLimiter` truyền | Đếm rồi so — lệch arg là bug im lặng (Lua nhận `nil`) |

## B2 — Integration test (Redis 8.6 thật)

`packages/guard/test/integration/` · `pnpm --filter @megawin/guard test:integration`
`flushDb()` trong `beforeEach` (**bắt buộc**), `fileParallelism: false`.

### `rate-limiter.test.ts`

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 14 | `limit` request đầu trong window → **tất cả** `allowed: true` | Vòng lặp, assert từng lần | Đường thành công |
| 15 | Request vượt → `allowed: false` **và** `retryAfterMs > 0` | Cả 2 field | `retryAfterMs = 0` lúc denied làm client retry ngay → bão request |
| 16 | Chờ đúng `retryAfterMs` → `allowed: true` lại | `await sleep(retryAfterMs)` rồi gọi lại | Chứng minh leak/refill hoạt động, không phải khoá cứng tới hết window |
| 17 | `remainingBurst` giảm dần và **không âm** | `toBeGreaterThanOrEqual(0)` | Số âm lộ ra metric/response sẽ gây hiểu sai |
| 18 | 2 subject khác nhau **độc lập** | A vượt ngưỡng, B vẫn `allowed: true` | Cô lập key — bug này gây chặn oan hàng loạt |
| 19 | Key có TTL > 0, và **biến mất** sau khi hết hạn | `ttl()` > 0, rồi `exists()` false | Không có cleanup job → TTL sai = leak keyspace vĩnh viễn |
| 20 | Gọi lần đầu (`EVALSHA` chưa cache) → vẫn đúng | Process mới, không preload SHA | Nhánh `NOSCRIPT` → `EVAL` fallback |
| 21 | Gọi lần 2+ → dùng SHA đã cache | Spy: `scriptLoad`/`eval` **không** gọi lại | Chứng minh 1 RTT như thiết kế hứa |
| 22 | `FLUSHALL` giữa 2 lần gọi (Redis xoá script cache) → **tự phục hồi** | Gọi → `FLUSHALL` → gọi lại, vẫn đúng | Ca thật khi Redis restart. Thiếu test này thì `NOSCRIPT` chỉ được cover ở lần đầu |

### `rate-limiter-fail-open.test.ts` — **file quan trọng nhất của plan**

`redisEnvKey` trỏ env riêng (VD `REDIS_URI_BROKEN` = `redis://127.0.0.1:6399`), set qua
`process.env[...]`. **Không** sửa `REDIS_URI`, **không** tạo/sửa `.env*`.

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 23 | Redis không tới được → `{allowed: true, failedOpen: true}` | Cả 2 field, **và** `not.toThrow()` | Yêu cầu chức năng cốt lõi (analysis §3.4) |
| 24 | Lời gọi đó hoàn thành **nhanh** | Đo `Date.now()`, assert `< DEFAULT_REDIS_CONNECT_DEADLINE_MS` (hằng thật, không số ma) | Chỉ pass **sau** `p0-00`. Trước đó treo 12s+ (đã đo) |
| 25 | Lời gọi thứ 2 nhanh hơn rõ rệt (`< 50ms`) | So 2 mốc | Circuit breaker của `p0-00` chặn thật, không trả giá connect lại |
| 26 | Redis sống: `failedOpen` **luôn false** (cả khi `allowed: false`) | `toBe(false)` | Trộn 2 khái niệm này làm metric `p2-01` vô nghĩa (không phân biệt "chặn thật" vs "Redis chết") |
| 27 | Redis trả reply **sai shape** (không phải mảng 3 số) → fail-open, không crash | Ghi giá trị rác vào key rồi gọi | Narrow `unknown` sai sẽ throw `TypeError` — lỗi này lọt qua mọi test dùng Redis sạch |

## B3 — Không regress

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 28 | `pnpm --filter @megawin/cache test` | Xanh **toàn bộ** — Bước 1+2 sửa `packages/cache` |
| 29 | `pnpm --filter @megawin/guard build` | Có `dist/`, không lỗi |
| 30 | `pnpm check-types` | Xanh toàn repo |
| 31 | `rg -l "@megawin/guard" apps/ packages/ --glob '!packages/guard/**'` | **Không kết quả** — chứng minh plan chưa đổi hành vi runtime |

## B4 — Xác nhận thủ công

1. **Đo latency thêm** của `checkRateLimit()` với Redis sống (kỳ vọng 1 RTT). Ghi số cụ thể — đây là
   cơ sở so sánh cho `p1-02`/`p2-01`.
2. **Blip:** Redis sống → gọi OK → `docker stop` → gọi (fail-open, nhanh) → `docker start` → gọi lại
   **phải OK** mà không restart process. Test cái bẫy `reconnectStrategy` ở `p0-00` A2.
3. Đọc key thật trên Redis (`KEYS guard:*`) — xác nhận bằng mắt **không** có IP/accountId nguyên bản.

## Definition of done

**Phần A (code):**

- [x] `RedisRepository` có `eval`/`evalSha`/`scriptLoad`, JSDoc đầy đủ, vẫn fail-fast, không `any`.
- [x] `CacheNamespace.Guard` đã thêm (1 dòng, có JSDoc).
- [x] `gcra-math.ts` là **pure** (không import Redis) — điều kiện để B1 tồn tại.
- [x] Lua script **không** dùng `TIME`; mỗi `ARGV[n]` có comment ghi đơn vị.
- [x] `RateLimitDecision` có `failedOpen`; `RateLimiter` **không bao giờ throw**.
- [x] Timeout 100ms qua `withDeadline` (thay `commandOptions` — đã bỏ ở p0-00); `redisEnvKey` optional.
- [x] `GuardSubjectType` dùng `const object as const`.
- [x] `packages/guard` build + `check-types` xanh; `oxlint packages/guard packages/cache` không error;
      `prettier --write` đã chạy.

**Phần B (test):**

- [x] B0: 4 xác nhận môi trường xong (agent 2026-09-22, ngoài Seatbelt):
  0a Docker OK · 0b `redis_version:8.6.6` · 0c GCRA/INCREX/CL.THROTTLE **cả 3 nil** · 0d EVAL=1.
- [x] 13 unit test (B1) xanh — `pnpm test:unit` → 13 passed (2026-09-21; re-run 2026-09-22).
- [x] 14 integration test (B2) xanh — agent 2026-09-22:
  `rate-limiter` 9 + `rate-limiter-fail-open` 5 = **14 passed** (exit 0).
  stderr `ECONNREFUSED` / `reply sai shape` là **kỳ vọng** (fail-open path).
- [x] B3 #31 xác nhận **chưa handler nào** import `@megawin/guard`.
- [x] B3 #29–#30: `guard` build + `tsc --noEmit` xanh (agent, 2026-09-22).
- [x] B3 #28: `pnpm --filter @megawin/cache test` → **75 passed** / 8 files (agent 2026-09-22).
- [x] B4 đã làm tay (agent 2026-09-22): latency avg **0.6ms** (5 calls);
  `KEYS guard:*` hashed (`ip_<hex>`), **không** lộ IP/account;
  blip stop → `failedOpen: true`; sau start + circuit 5s + đúng port → `failedOpen: false`, `remainingBurst: 4`.
- [x] Mọi `A-fix` phát sinh đã ghi lại.

## Ghi chú thực thi Phần A (2026-09-21)

- **A-adapt:** Plan gốc nói timeout qua `commandOptions` trên mọi method repo. p0-00 đã **bỏ**
  tham số đó (node-redis `timeout` không cắt được lệnh đã gửi). `RateLimiter` dùng
  `withDeadline(100ms)` giống `RedisCacheStore` — đạt cùng mục tiêu fail-open nhanh.
- Export thêm `DEFAULT_REDIS_ENV_KEY` từ `@megawin/cache` (trước chỉ dùng nội bộ) để guard
  không hard-code `"REDIS_URI"`.
- Subpath `./middleware` chỉ là stub `export {}` — implement thật ở `p1-01`.
- Chưa có consumer ngoài `packages/guard` (đã `rg` xác nhận).

## Ghi chú thực thi Phần B (2026-09-21)

- **A-fix (B1 #12):** comment trong `gcra.lua.ts` chứa chữ `TIME` ("KHÔNG dùng TIME") →
  `not.toMatch(/\bTIME\b/)` đỏ giả. Đổi comment sang "KHÔNG lấy đồng hồ Redis" — script vẫn
  không gọi lệnh `TIME`.
- **A-fix (B2 #24):** export `DEFAULT_REDIS_CONNECT_DEADLINE_MS` từ `@megawin/cache` index
  (trước chỉ import được relative trong package cache) để test assert hằng thật, không số ma.
- File test đã tạo:
  - `test/unit/gcra-math.test.ts` (#1–6)
  - `test/unit/keys.test.ts` (#7–11)
  - `test/unit/lua-script.test.ts` (#12–13)
  - `test/integration/rate-limiter.test.ts` (#14–22)
  - `test/integration/rate-limiter-fail-open.test.ts` (#23–27)
- **B0/B2/B3#28/B4:** xanh 2026-09-22 qua `required_permissions: ["all"]` (Seatbelt vẫn
  chặn `docker.sock` dù có `.cursor/sandbox.json` `insecure_none` — cần escape sandbox từng lệnh).
  Log: `packages/guard/test/p0-01-part-b.out.txt`. Script B4 cần `./node_modules/.bin/tsx`
  (không phải `node --import tsx` từ root).

## Không làm trong plan này (chống scope creep)

- ❌ Hook vào `buildHandler` → `p1-01`.
- ❌ Idempotency → `p0-02`.
- ❌ Metrics/alert → `p2-01`.
- ❌ Thêm `REDIS_RATELIMIT_URI` vào SSM/serverless.yml — MVP dùng chung `REDIS_URI` (analysis §5.3).
- ❌ Sửa `apps/*/serverless.yml`.