# p1-03 — Rollout Rate Limit: `apps/api-tenant`

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md` §4.2
> Overview: `./00-overview.md` · Phase P1 · Chặn bởi: `p1-01` · Song song được với `p1-02`

Bật rate limit cho `api-tenant` — traffic **server-to-server** từ tenant, đặc tính khác hẳn player.

## Phát hiện quan trọng: chỉ 3/6 handler được deploy

Đã verify: `apps/api-tenant/src/handlers/` có 6 file nhưng `src/functions/*.yml` chỉ khai **3 route**.

| Path thật | Handler | Deployed? |
|---|---|---|
| `POST /player/login` | `player-login.ts` | ✅ |
| `GET /tenant/bets/feed` | `get-entry-feed.ts` | ✅ |
| `GET /tenant/reports/revenue` | `get-reports.ts` | ✅ |
| — | `list-players.ts`, `get-player-detail.ts`, `suspend-player.ts` | ❌ **không có event httpApi** |

→ Plan này chỉ làm **3 endpoint**. Không lên kế hoạch cho endpoint chưa tồn tại trên API Gateway.
(Nếu 3 handler kia được deploy sau, thêm rule là việc của PR deploy chúng.)

## Đặc thù `api-tenant` — khác `api-player` ở 3 điểm

1. **Identity là `tenantId`**, không phải player → `subject: "tenant"` (`event.tenant.tenantId`,
   `with-tenant-auth.ts:21`).
2. **Traffic server-to-server**: burst cao là bình thường (batch job của tenant), nhưng số tenant ít
   → ngưỡng per-tenant phải **cao hơn nhiều** so với per-player.
3. **Đã có IP whitelist** ở tầng auth tenant → kẻ lạ không vào được. Rủi ro ở đây là **tenant hợp lệ
   hành xử sai** (poll loop, retry storm, script enumeration), không phải kẻ tấn công ẩn danh.

Điểm 3 đổi mục tiêu: rate limit ở `api-tenant` là **bảo vệ hạ tầng khỏi tenant vô ý**, không phải
chống tấn công. Nên message lỗi và log phải giúp tenant tự sửa, và ngưỡng nên rộng tay.

## Endpoint 1 — `POST /player/login` (ưu tiên cao nhất)

Rủi ro cụ thể: schema `playerExternalId` là `[a-zA-Z0-9]{4,32}` (`player-login.ts:17-23`), không giới
hạn tần suất → tenant (hoặc code lỗi của tenant) có thể **enumerate/tạo hàng loạt** player.

Cần **2 lớp** (đây là endpoint duy nhất cần 2 lớp):

| Lớp | Rule đề xuất | Chặn gì |
|---|---|---|
| Per-player | `limit: 10, windowSec: 60, subject: "tenant"` nhưng key gồm cả `playerExternalId` | Brute-force/spam 1 player cụ thể |
| Per-tenant | `limit: 600, windowSec: 60, subject: "tenant"` | Enumeration hàng loạt |

⚠️ Lớp per-player cần key gồm **giá trị từ body** (`playerExternalId`) → chỉ có sau `validatorZod`,
nhưng `p1-01` đặt middleware **trước** `validatorZod`. Hai đường ra:

- **Khuyến nghị:** làm lớp per-tenant ở middleware (trước validate), lớp per-player **trong handler**
  bằng cách gọi trực tiếp `RateLimiter` của `@megawin/guard`. Handler vẫn mỏng (1 lời gọi), và không
  phải đảo thứ tự chain vì một endpoint.
- Không khuyến nghị: thêm cơ chế `subjectFromBody` vào middleware → buộc chuyển middleware xuống sau
  `validatorZod`, mất lợi ích "từ chối trước khi parse body" cho **mọi** endpoint khác.

Ghi rõ lựa chọn vào code comment kèm lý do.

## Endpoint 2 — `GET /tenant/bets/feed`

`docs/cache/04` §2.1 ghi rõ endpoint này *"bị tenant poll liên tục"*.

- Rule đề xuất: `limit: 60, windowSec: 60, burst: 10, subject: "tenant"`.
- `burst: 10` cao hơn player vì tenant batch-poll nhiều page liên tiếp là hành vi hợp lệ (endpoint có
  cursor pagination).
- **Giá trị thật của rate limit ở đây**: biến poll storm thành **lỗi rõ ràng** (429 + log) thay vì âm
  thầm đốt Mongo. Hiện tại tenant poll sai không ai biết cho tới khi Mongo chậm.
- Message lỗi nên hướng tenant tới cách đúng (dùng cursor, giãn nhịp poll) — nhưng **vẫn là message
  UI**, không lộ tên collection/hệ thống.

## Endpoint 3 — `GET /tenant/reports/revenue`

- Rule đề xuất: `limit: 20, windowSec: 60, subject: "tenant"`.
- Query nặng nhất app → ngưỡng chặt nhất.
- Report thường được gọi theo giờ/ngày, không realtime → 20/phút đã rất rộng tay.

## Hạ tầng

- `REDIS_URI` **đã có** trong `apps/api-tenant/serverless.yml:81` (env + SSM fallback) → **không cần
  sửa serverless.yml**. Đã verify.
- **Không** tạo/sửa file `.env*` (`no-env-file-modification.mdc`).
- Thêm `@megawin/guard` vào `apps/api-tenant/package.json` **chỉ khi** handler gọi trực tiếp
  `RateLimiter` (trường hợp lớp per-player ở Endpoint 1). Nếu chỉ dùng qua middleware thì không cần —
  đã đến qua `@megawin/auth` (`p1-01` Bước 6).

## Rollout

Cả 3 endpoint vào **shadow mode** cùng lúc — app nhỏ (3 route), không cần chia đợt như `p1-02`.

Chuyển `enforce` cần thêm một bước mà `p1-02` không có: **thông báo trước cho tenant**. Tenant là đối
tác B2B có hợp đồng; bất ngờ nhận 429 trên production là sự cố quan hệ, không chỉ là sự cố kỹ thuật.
Cần chốt với business: thông báo qua đâu, trước bao lâu, ngưỡng có ghi vào tài liệu tích hợp không.

## Test

- Unit: resolve `tenantId` đúng từ `event.tenant`; thiếu `tenant` → fallback IP + log.
- Integration: vượt ngưỡng per-tenant → 429; tenant A vượt **không** ảnh hưởng tenant B (test cô lập
  key — đây là test dễ bị bỏ sót và hậu quả nghiêm trọng).
- Endpoint 1: per-player và per-tenant hoạt động **độc lập** (vượt per-player không làm hụt quota
  per-tenant của player khác).

## Definition of done

- [ ] 3 endpoint deployed đã bật shadow mode ở `dev` + `prod`.
- [ ] Endpoint 1 có cả 2 lớp; lựa chọn vị trí lớp per-player đã ghi lý do vào code comment.
- [ ] Test cô lập giữa các tenant đã pass.
- [ ] Ngưỡng đã đối chiếu số liệu thật, không giữ nguyên số suy đoán.
- [ ] `check-types` + `oxlint` + `prettier` xanh.
- [ ] **Không** sửa `serverless.yml`, **không** sửa `.env*`.
- [ ] `enforce` **chưa** bật; đã nêu yêu cầu thông báo tenant trong PR description.

## Không làm trong plan này

- ❌ Bật `enforce`.
- ❌ Rate limit cho 3 handler chưa deploy (`list-players`, `get-player-detail`, `suspend-player`).
- ❌ Idempotency cho `suspend-player` — endpoint chưa deploy, và idempotent tự nhiên (suspend 2 lần =
  suspend). Nếu sau này cần → `p3-01`.
- ❌ `api-player` → `p1-02`.
