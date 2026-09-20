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

## Test

**Unit** (mock rate limiter, không cần Redis):
- Resolve subject đúng cho từng `subject` type; fallback IP khi thiếu identity (+ có log).
- `shadow` → luôn cho qua kể cả khi decision là `denied`, **và** có log.
- `enforce` + denied → `earlyResponse` 429, header `Retry-After` đúng giây (làm tròn lên), body đúng envelope.
- `off` → **không** gọi rate limiter (assert bằng spy — chứng minh không tốn RTT).
- `failedOpen: true` → cho qua kể cả ở `enforce`.

**Integration** (Redis thật, 1 handler giả):
- Vượt ngưỡng ở `enforce` → 429 thật; `shadow` → 200.
- Redis chết → vẫn 200 (fail-open end-to-end).

## Definition of done

- [ ] `buildHandler` nhận `rateLimit` optional; 5 wrapper truyền qua, **không** breaking change.
- [ ] Chain đúng thứ tự: sau `auth`, trước `validatorZod`.
- [ ] 3 mode, mặc định `shadow`, đổi được qua **env** không cần deploy.
- [ ] 429 qua `earlyResponse`, có `Retry-After`, body đúng envelope `{ success, error: { code, message } }`.
- [ ] Fail-open end-to-end đã test.
- [ ] `check-types` xanh cho `packages/auth`, `apps/api-player`, `apps/api-tenant`.
- [ ] `oxlint` + `prettier` đã chạy.
- [ ] **Chưa endpoint thật nào bật `rateLimit`** — rollout là `p1-02`/`p1-03`.
- [ ] **Không** file `.env*` nào bị tạo/sửa.
