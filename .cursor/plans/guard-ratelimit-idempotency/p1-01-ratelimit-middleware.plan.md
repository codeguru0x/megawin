# p1-01 — Rate Limit Middleware + Shadow Mode

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md`
> Overview: `./00-overview.md` · Phase P1 · Chặn bởi: `p0-01` · Chặn: `p1-02`, `p1-03`

Hook `@megawin/guard` vào `buildHandler()` để mọi handler Lambda **có thể** bật rate limit bằng 1 khai
báo. Kết thúc plan: middleware hoạt động, nhưng **chưa endpoint nào bật** và **chế độ mặc định là
shadow** (chỉ log, không chặn).

## Vì sao sửa đúng 1 chỗ là đủ

`packages/auth/src/handler-wrappers.ts:98-109` — `buildHandler()` là **cửa ngõ duy nhất** của mọi
handler trong `api-player` + `api-tenant`. Cả 5 wrapper đi qua đây:

| Wrapper | Identity khả dụng |
|---|---|
| `withPlayerAuth` | `event.user.accountId`, `tenantId`, `username` |
| `withAgentAuth`, `withCompanyAuth` | `event.user.*` |
| `withTenantAuth` (`tenant/with-tenant-auth.ts:20-28`) | `event.tenant.tenantId` |
| `withPublicHandler` | **không có** → chỉ IP (`handler-wrappers.ts:143-150` đã ghi rõ dự tính này) |

---

# PHẦN A — CODE (AI agent implement)

> Chỉ code production. **Không** viết test ở Phần A. Kết thúc Phần A: `check-types` xanh cho
> `packages/auth`, `apps/api-player`, `apps/api-tenant` + `oxlint` không error.
> Test đỏ ở Phần B → quay lại đây, ghi `A-fix: <lý do>`.

## Bước 1 — Vị trí trong chain

```
auth → [rateLimit] → validatorZod → successEnvelope → errorHandler
```

- **Sau `auth`**: cần `accountId`/`tenantId`. Key theo identity mạnh hơn IP — mobile NAT/CGNAT khiến
  hàng nghìn player chung IP (đây là lý do analysis §4 **CUT** đề xuất "IP làm mặc định").
- **Trước `validatorZod`**: từ chối sớm, không tốn CPU parse body của kẻ spam.

Sửa `buildHandler` để nhận thêm tham số optional. Ràng buộc: **không đổi signature public** của 5
wrapper theo cách breaking — thêm field optional vào options object đã có.

## Bước 2 — Khai báo tại handler (tĩnh, đọc được bằng mắt)

```ts
export const handler = withPlayerAuth(
  async (event) => useCase.run({ /* … */ }),
  {
    schemas: { body: kenoPlaceBetBodySchema },
    rateLimit: { route: "keno.place-bet", limit: 30, windowSec: 60, burst: 5, subject: "account" },
  },
);
```

- `route` là **hằng do developer khai**, không lấy từ request → key đọc được khi debug, không bị
  client tác động cardinality.
- `subject` dùng `GuardSubjectType` (`const object as const` từ `p0-01`), **không** string literal trần.
- Mặc định **không** có `rateLimit` = không bật. **Không** bật mù toàn bộ: cùng ngưỡng cho
  `list-draw-results` và `place-bet` là vô nghĩa và dễ gây sự cố oan.

## Bước 3 — Resolve subject

Thứ tự ưu tiên, dừng ở cái đầu tiên có:

1. `subject: "account"` → `event.user.accountId`
2. `subject: "tenant"` → `event.tenant.tenantId` hoặc `event.user.tenantId`
3. `subject: "ip"` → `extractClientIpFromApiGatewayV2(event)` (`@megawin/shared/utils/ip`, tiền lệ
   `handlers/keno/place-bet.ts:154`)

Xử lý biên **bắt buộc**:

- Khai `subject: "account"` nhưng event không có (vd lập trình viên gắn vào `withPublicHandler`) →
  **fallback IP** + `logError` cảnh báo cấu hình sai. **Không** crash, **không** im lặng bỏ qua rate limit.
- IP không lấy được → bỏ qua rate limit + log. Không lấy được IP mà chặn hết là tự gây sự cố.

## Bước 4 — Shadow mode (bắt buộc, mặc định)

Ba chế độ, khai bằng `const object as const`:

| Mode | Hành vi | Dùng khi |
|---|---|---|
| `shadow` (**mặc định**) | Tính quyết định, **log** khi vượt, **vẫn cho qua** | Thu số liệu trước khi chặn |
| `enforce` | Chặn thật, trả 429 | Sau khi số liệu xác nhận ngưỡng đúng |
| `off` | Bỏ hẳn, không gọi Redis | Tắt nhanh khi sự cố |

Lý do mặc định `shadow` (analysis §5.1): mọi ngưỡng ở §4.1/§4.2 là **suy đoán theo kinh nghiệm**, chưa
dựa trên số liệu thật. Bật `enforce` ngay là canh bạc với traffic thật.

Yêu cầu: chế độ **đổi được qua env** (vd `GUARD_RATELIMIT_MODE`) để tắt khẩn cấp **không cần deploy
code**. Đây là yêu cầu vận hành, không phải tùy chọn. Env đọc qua đường env hiện có của từng app —
**KHÔNG** tạo/sửa bất kỳ file `.env*` (`no-env-file-modification.mdc`).

## Bước 5 — Response 429 kèm `Retry-After`

`httpErrorHandlerUseCaseFormat` hard-code `JSON_HEADERS` → **throw `AppException` không gắn được
header**. Dùng `request.earlyResponse` — đúng tiền lệ `validatorZodMiddleware`
(`packages/app-core/src/lambda/middleware/validator-zod.ts:86-100`, hàm `buildValidationResponse`).

Body **phải** đúng envelope chuẩn `{ success: false, error: { code, message } }` — cùng shape mọi lỗi
khác. Lý do: bug 14/08/2026 đã ghi trong JSDoc `validator-zod.ts:70-81` — body phẳng làm client bóc
`json.error.code` nhận `undefined` → `code: "UNKNOWN"`, mất sạch chi tiết.

```
statusCode: 429
headers: { "Content-Type": "application/json", "Retry-After": "<seconds>" }
body: { success: false, error: { code: "TOO_MANY_REQUESTS", message: "<tiếng Việt cho người dùng>" } }
```

- `TOO_MANY_REQUESTS` đã có (`error-codes.ts:26`) và đã map 429 (`http-status.ts:32`) — **không** tạo code mới.
- `Retry-After` theo RFC là **giây**, làm tròn **lên** từ `retryAfterMs`, tối thiểu `1`.
- Message là **UI tiếng Việt**: *"Bạn đang thao tác quá nhanh, vui lòng thử lại sau ít giây."* Không
  lộ ngưỡng/route/tên hệ thống (`error-handling-conventions.mdc`: message `AppException` là phần UI).
- **Không** nhồi chi tiết kỹ thuật vào `details` — `details` cũng trả nguyên văn cho client.

Lưu ý phối hợp: `withRetry` của repo (`packages/http-client/src/retry.ts:44,187-189`) retry status
`429` nhưng **không đọc `Retry-After`** (dùng exponential backoff). Nên `Retry-After` là tín hiệu cho
client bên ngoài. **Không** sửa `withRetry` trong plan này — ngoài scope, và đổi hành vi retry của
đường gọi tenant là việc nhạy cảm cần đánh giá riêng.

## Bước 6 — Dependency

`@megawin/cache` hiện **không** nằm trong `dependencies` của `apps/api-player/package.json` (chỉ đến
transitively qua `game-*-application`). Thêm `@megawin/guard` vào:

- `packages/auth/package.json` (nơi `buildHandler` sống) — **đây là chỗ đúng**, vì middleware ở đó.
- Kiểm tra `packages/auth` không tạo import vòng (`import/no-cycle`): `@megawin/guard` chỉ phụ thuộc
  `@megawin/cache` + `@megawin/shared`, **không** phụ thuộc `@megawin/auth` → không vòng.

**Không** sửa `apps/*/serverless.yml`: `REDIS_URI` đã có trong `provider.environment` của `api-player`.
⚠️ **Phải kiểm tra `apps/api-tenant/serverless.yml` có `REDIS_URI` chưa** — nếu chưa, thêm là việc của
`p1-03` (nơi bật rate limit cho app đó), không phải plan này.

---

# PHẦN B — TEST (viết SAU khi Phần A xong)

> Không sửa `src/` ở Phần B. Test đỏ = Phần A sai.

## B0 — Xác nhận môi trường

| # | Việc | Kỳ vọng | Nếu sai |
|---|---|---|---|
| 0a | `docker info` + Redis 8.6 container | Up, `redis_version:8.6.x` | Dừng |
| 0b | `rg REDIS_URI apps/api-tenant/serverless.yml` | Có (đã verify: dòng 81) | Thiếu → là việc của `p1-03`, ghi lại, **không** tự thêm ở plan này |
| 0c | `packages/auth` có `vitest.config.ts` chưa | Nếu chưa → tạo, copy khuôn `packages/cache/vitest.config.ts` (2 project unit/integration, `globalSetup` redis cho integration). **Không** tạo `.oxlintrc*`/`.prettierrc*` riêng | — |

## B1 — Unit test (mock rate limiter, KHÔNG cần Redis)

`packages/auth/test/unit/` · `pnpm --filter @megawin/auth test:unit`

Mock `RateLimiter` ở đây là **đúng**: đang test middleware, không test rate limiter (đã test ở `p0-01`).

### `resolve-subject.test.ts`

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 1 | `subject: "account"` + `event.user.accountId` → dùng accountId | Key chứa hash của accountId | Đường chính |
| 2 | `subject: "tenant"` + `event.tenant.tenantId` → dùng tenantId | — | `withTenantAuth` |
| 3 | `subject: "tenant"` **không** có `event.tenant` nhưng có `event.user.tenantId` → dùng cái sau | — | Thứ tự ưu tiên ở Bước 3 |
| 4 | `subject: "ip"` → dùng `extractClientIpFromApiGatewayV2` | — | `withPublicHandler` |
| 5 | Khai `"account"` nhưng event **không** có identity → **fallback IP** + `logError` | Có key IP **và** spy log được gọi | Lập trình viên gắn sai wrapper. Im lặng bỏ qua rate limit là tệ nhất |
| 6 | Không lấy được IP → **bỏ qua** rate limit + log, **không** chặn | Rate limiter **không** được gọi; request đi tiếp | Chặn hết vì không đọc được IP = tự gây sự cố |
| 7 | 2 event khác subject → 2 key khác nhau | `not.toBe()` | Cô lập |

### `rate-limit-mode.test.ts`

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 8 | `shadow` + decision denied → **vẫn cho qua** | Handler **được** gọi (spy) **và** có log | Mặc định an toàn |
| 9 | `shadow` + denied → log có đủ field cho `p2-01` (route, subjectType, decision) | Kiểm field trong payload log | Log thiếu field = `p2-01` không quyết được ngưỡng |
| 10 | `enforce` + denied → `earlyResponse` 429, handler **không** được gọi | Spy handler `not.toHaveBeenCalled()` | Chặn thật |
| 11 | `enforce` + allowed → handler được gọi | — | Không chặn oan |
| 12 | `off` → rate limiter **không** được gọi lần nào | Spy `not.toHaveBeenCalled()` | Chứng minh 0 RTT — tắt khẩn cấp phải thật sự rẻ |
| 13 | Không khai `rateLimit` → rate limiter không được gọi | Spy | Mặc định không bật |
| 14 | Mode mặc định khi không có env → **`shadow`** | — | Deploy quên set env **không** được thành `enforce` |
| 15 | Env `GUARD_RATELIMIT_MODE` đổi được mode, giá trị **rác** → fallback `shadow` + log | Không crash | Typo env không được làm chết app hoặc bật chặn ngoài ý muốn |
| 16 | `failedOpen: true` → cho qua **kể cả ở `enforce`** | Handler được gọi | Redis chết không được thành outage |

### `429-response.test.ts`

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 17 | Body đúng envelope `{ success: false, error: { code, message } }` | So **cấu trúc lồng**, không so chuỗi phẳng | Bug 14/08/2026 (JSDoc `validator-zod.ts:70-81`): body phẳng → client bóc `json.error.code` nhận `undefined` |
| 18 | `code === "TOO_MANY_REQUESTS"` | Dùng hằng từ `error-codes.ts`, **không** literal | Code mới sẽ không map được 429 |
| 19 | `statusCode === 429` | — | — |
| 20 | `Retry-After` là **giây**, làm tròn **lên**: `retryAfterMs: 1500` → `"2"` | `toBe("2")` | RFC dùng giây. Làm tròn xuống → client retry quá sớm |
| 21 | `retryAfterMs: 100` → `Retry-After: "1"` (tối thiểu 1) | `toBe("1")` | `"0"` làm client retry tức thì → bão request |
| 22 | Header có `Content-Type: application/json` | — | `earlyResponse` không tự thêm |
| 23 | Message là tiếng Việt, **không** chứa ngưỡng/route/tên class | `not.toMatch(/limit\|route\|RateLimiter\|\d+\/\d+/)` | Message là **UI** (`error-handling-conventions.mdc`); lộ ngưỡng giúp kẻ tấn công dò |
| 24 | **Không** có `details` chứa chi tiết kỹ thuật | `details` undefined hoặc sạch | `details` cũng trả nguyên văn cho client |

### `chain-order.test.ts`

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 25 | Thứ tự: `auth` → `rateLimit` → `validatorZod` | Ghi thứ tự gọi qua spy, so mảng | **Sau auth**: cần identity. **Trước Zod**: không tốn CPU parse body kẻ spam. Đảo thứ tự là bug im lặng |
| 26 | `enforce` + denied → `validatorZod` **không** chạy | Spy | Chứng minh tiết kiệm CPU thật |
| 27 | Cả 5 wrapper (`withPlayerAuth`, `withAgentAuth`, `withCompanyAuth`, `withTenantAuth`, `withPublicHandler`) truyền `rateLimit` qua được | Vòng lặp 5 wrapper | Sót 1 wrapper = rollout sau đó im lặng không bật |
| 28 | Handler **cũ** (không khai `rateLimit`) hành vi **không đổi** | So response trước/sau | Không breaking change |

## B2 — Integration test (Redis 8.6 thật, handler giả)

`packages/auth/test/integration/` · `flushDb()` trong `beforeEach`.

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 29 | `enforce`: vượt ngưỡng → **429 thật** end-to-end | Gọi n+1 lần qua handler giả | Unit test dùng mock; test này chứng minh Lua + middleware khớp nhau |
| 30 | `shadow`: vượt ngưỡng → **200** | — | Mặc định không chặn |
| 31 | Sau khi chờ `Retry-After` giây → 200 lại | `sleep(retryAfter * 1000)` | Giá trị header **đúng thật**, không chỉ đúng công thức |
| 32 | Redis chết → **200** (fail-open end-to-end) | Redis container stop hoặc env broken | Chỉ pass sau `p0-00` |
| 33 | Redis chết → latency thêm **nhỏ** | Đo, assert `< DEFAULT_REDIS_CONNECT_DEADLINE_MS` | Fail-open mà chậm 5s vẫn là outage |
| 34 | 2 subject khác nhau độc lập end-to-end | A bị 429, B vẫn 200 | Chặn oan hàng loạt |
| 35 | 2 route khác nhau cùng subject độc lập | `place-bet` bị 429, `list-tickets` vẫn 200 | `route` phải nằm trong key |

## B3 — Không regress

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 36 | `pnpm --filter @megawin/auth test` | Xanh toàn bộ |
| 37 | `pnpm --filter @megawin/auth check-types` + `api-player` + `api-tenant` | Xanh |
| 38 | `oxlint packages/auth` | Không error, **không** import cycle (`import/no-cycle`) |
| 39 | `rg -n "rateLimit" apps/api-player/src/handlers apps/api-tenant/src/handlers` | **Không kết quả** — chưa endpoint thật nào bật (rollout là `p1-02`/`p1-03`) |
| 40 | `git status --short \| rg '\.env'` | **Không kết quả** — không file `.env*` nào bị tạo/sửa |

## B4 — Xác nhận thủ công

1. **Đo latency thêm** của middleware khi Redis sống, ở `shadow` và `enforce`. Ghi số — đây là cơ sở
   quyết định ngưỡng ở `p1-02`.
2. **Đổi mode bằng env, không deploy lại code**: chạy handler giả với `GUARD_RATELIMIT_MODE=off` →
   xác nhận Redis **không** bị gọi (`MONITOR` hoặc `INFO commandstats`). Đây là yêu cầu vận hành, phải
   chứng minh được bằng tay.
3. **Đọc log shadow mode thật**: xác nhận payload đủ field để `p2-01` dùng được, không phải chuỗi tự do.

## Definition of done

**Phần A (code):**

- [ ] `buildHandler` nhận `rateLimit` optional; 5 wrapper truyền qua, **không** breaking change.
- [ ] Chain đúng thứ tự: sau `auth`, trước `validatorZod`.
- [ ] 3 mode (`const object as const`), mặc định `shadow`, đổi được qua **env** không cần deploy.
- [ ] 429 qua `earlyResponse`, có `Retry-After`, body đúng envelope `{ success, error: { code, message } }`.
- [ ] `@megawin/guard` thêm vào `packages/auth/package.json`, không tạo import cycle.
- [ ] `oxlint` + `prettier` đã chạy.
- [ ] **Không** file `.env*` nào bị tạo/sửa.

**Phần B (test):**

- [ ] B0: 3 xác nhận môi trường xong (0b chỉ **ghi lại**, không tự sửa `serverless.yml`).
- [ ] 28 unit test (B1) xanh — gồm #14 (mặc định `shadow`), #17 (envelope), #20–21 (`Retry-After`), #25 (thứ tự chain).
- [ ] 7 integration test (B2) xanh — gồm #32–33 (fail-open + latency), #35 (cô lập theo route).
- [ ] B3 #39 xác nhận **chưa endpoint thật nào** bật `rateLimit`; #40 xác nhận không đụng `.env*`.
- [ ] B4 đã làm tay, có số đo latency + bằng chứng `off` không gọi Redis.
- [ ] Mọi `A-fix` phát sinh đã ghi lại.

