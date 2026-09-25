---
name: ""
overview: ""
todos: []
isProject: false
---

# p1-03 — Rollout Rate Limit: `apps/api-tenant`

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md` §4.2
> Overview: `./00-overview.md` · Phase P1 · Chặn bởi: `p1-01` · Song song được với `p1-02`

Bật rate limit cho `api-tenant` — traffic **server-to-server** từ tenant, đặc tính khác hẳn player.

> **Bối cảnh đã chốt (2026-09-22): chưa deploy production, chưa tenant nào tích hợp thật.** Vì vậy:
> - **Shadow mode** không còn tồn tại (`p1-01`) → 3 endpoint bật `enforce` ngay.
> - **Bỏ yêu cầu "thông báo trước cho tenant"** — chưa có tenant nào đang chạy để phải thông báo.
>   Thay bằng: **ghi ngưỡng vào tài liệu tích hợp** ngay từ đầu, để tenant biết trước khi tích hợp.
>   Đây là cách xử lý đúng và rẻ hơn hẳn việc thông báo thay đổi sau.
> - Hiệu chỉnh ngưỡng bằng **load test staging**, không bằng đọc log shadow production.

---

# PHẦN A — KHAI BÁO (AI agent implement)

> Chỉ thêm khai báo `rateLimit` (+ lớp per-player ở Endpoint 1) + tài liệu tích hợp. Kết thúc Phần A:
> `check-types` + `oxlint` xanh, **không** đụng `serverless.yml`, **không** đụng `.env*`.
> Test đỏ ở Phần B → sửa khai báo, ghi `A-fix: <lý do>`.

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
2. **Đang dùng private, nội bộ** — thoải mái hơn player công khai, nhưng vẫn phải có trần chống flood.
   Không lấy số "hàng trăm request/giây" chỉ vì là server-to-server.
3. **Đã có IP whitelist** ở tầng auth tenant → kẻ lạ không vào được. Rủi ro là **tenant hợp lệ
   hành xử sai** (poll loop, retry storm, script enumeration).

Mục tiêu: bảo vệ hạ tầng khỏi tenant vô ý. Message lỗi và log giúp tenant tự sửa. Ngưỡng **rộng hơn
player ở đường đọc**, **chặt hơn ở login** (tạo/đăng nhập player là mutation).

## Endpoint 1 — `POST /player/login` (ưu tiên cao nhất)

Rủi ro cụ thể: schema `playerExternalId` là `[a-zA-Z0-9]{4,32}` (`player-login.ts:17-23`), không giới
hạn tần suất → tenant (hoặc code lỗi của tenant) có thể **enumerate/tạo hàng loạt** player.

Cần **2 lớp** (đây là endpoint duy nhất cần 2 lớp):

Login theo **từng player** vẫn chặt: một player mở game một lần, thêm vài retry. Lớp **cả tenant**
chốt **10 login/giây** (2026-09-25) — nội bộ, nhiều player mở game cùng lúc, nhưng không thả cửa.

| Lớp | Rule | Chặn gì |
|---|---|---|
| Per-player | `limit: 5, windowSec: 60, burst: 0, subject: "tenant"` nhưng key gồm cả `playerExternalId` | Spam / dò 1 player. 5 lần/phút đủ login + retry |
| Per-tenant | `limit: 10, windowSec: 1, burst: 0, subject: "tenant"` | Trần flood cả tenant: **10 login/giây**. GCRA `burst: 0` → mỗi request cách nhau 100ms (`floor(1000/10)`), không bắn 10 cái trong cùng một nhịp |

⚠️ Lớp per-player cần key gồm **giá trị từ body** (`playerExternalId`) → chỉ có sau `validatorZod`,
nhưng `p1-01` đặt middleware **trước** `validatorZod`. **Đã chốt:** lớp per-tenant ở middleware (trước
validate), lớp per-player **trong handler** bằng cách gọi trực tiếp `RateLimiter` của `@megawin/guard`.
Handler vẫn mỏng (1 lời gọi), và không phải đảo thứ tự chain vì một endpoint.

Phương án bị loại: thêm `subjectFromBody` vào middleware → buộc chuyển middleware xuống sau
`validatorZod`, mất lợi ích "từ chối trước khi parse body" cho **mọi** endpoint khác. Không đánh đổi
kiến trúc toàn app cho 1 endpoint.

Ghi rõ lựa chọn này vào code comment kèm lý do.

## Endpoint 2 — `GET /tenant/bets/feed`

Đường đọc, nội bộ, **thoải mái hơn login** — nhưng trần bám nhịp dữ liệu thật, không phải 60 lần/phút.

### Nhịp hệ thống đang yêu cầu (đã đối chiếu code, 2026-09-25)

| Nguồn | Việc nó nói | Con số |
|---|---|---|
| `apps/worker-*/src/functions/feed.yml` (cả 7 game) | Scheduler ghi feed | `cron(* * * * ? *)` = **1 lần/phút** |
| `packages/game-core/src/entities/entry-feed.ts` (`hasMore`) | `false`: chờ interval rồi poll lại. `true`: poll tiếp ngay để xả page | Interval = nhịp scheduler, tức 1 phút khi đã hết data |
| `get-entry-feed.ts` query schema | Mỗi lần lấy tối đa | `limit` 1–200, default 50 |

`apps/worker-keno/README.md` ghi `rate(30s)` — **lệch** với yml. Lấy yml làm sự thật: data mới xuất
hiện tối đa 1 lần/phút. Poll dày hơn thế khi `hasMore = false` không nhận thêm gì, chỉ đốt Mongo.

Số cũ `60/phút + burst 10` = **60 lần** nhịp cần thiết. Đó là poll storm, không phải "thoải mái".

### Trần: tối đa 3 lần nhịp yêu cầu

Chọn **3×** (đầu thoải mái của khoảng 2–3 lần user chốt):

| | |
|---|---|
| Rule | `{ limit: 3, windowSec: 60, burst: 2, subject: "tenant" }` |
| Nhịp bền | 3 request/phút (1 request mỗi 20 giây) = 3× scheduler |
| Xả page (`hasMore: true`) | `1 + burst` = **3 request liền**, rồi phải giãn 20 giây |
| `route` | `"tenant.bets-feed"` |

`burst: 2` là phần xả cursor mà contract yêu cầu ("poll tiếp ngay"), không phải cửa sổ bắn 11 phát.
Ba page × `limit=200` = 600 item/phút — đủ bắt kịp feed sync 1 phút/lần ở volume nội bộ hiện tại.
Load test (B4) nếu thấy backlog thật vượt 600 item/phút thì **chỉ nâng `burst`**, không kéo `limit`
lên hàng chục: nhịp bền phải giữ ở 3× scheduler.

- Message lỗi hướng tenant tới cursor + giãn nhịp khi `hasMore = false`, và `limit=200` khi cần xả.
  Vẫn là message UI, không lộ tên collection/hệ thống.

## Endpoint 3 — `GET /tenant/reports/revenue`

- Rule: `limit: 20, windowSec: 60, subject: "tenant"`.
- Query nặng nhất app → ngưỡng chặt nhất.
- Report thường được gọi theo giờ/ngày, không realtime → 20/phút đã rất rộng tay.

## Hạ tầng

- `REDIS_URI` **đã có** trong `apps/api-tenant/serverless.yml:81` (env + SSM fallback) → **không cần
  sửa serverless.yml**. Đã verify.
- **Không** tạo/sửa file `.env*` (`no-env-file-modification.mdc`).
- Thêm `@megawin/guard` vào `apps/api-tenant/package.json` **chỉ khi** handler gọi trực tiếp
  `RateLimiter` (trường hợp lớp per-player ở Endpoint 1). Nếu chỉ dùng qua middleware thì không cần —
  đã đến qua `@megawin/auth` (`p1-01` Bước 6).

## Tài liệu tích hợp tenant (thay cho "thông báo trước")

Vì chưa tenant nào tích hợp, cách đúng là **ghi ngưỡng vào tài liệu ngay từ đầu** — tenant đọc docs
rồi mới viết code, không bao giờ gặp 429 bất ngờ.

Phải làm trong cùng PR:

- Bảng 3 endpoint × ngưỡng × `subject` trong tài liệu tích hợp tenant.
- Giải thích `Retry-After` và cách xử lý 429 đúng (backoff, **không** retry ngay).
- Riêng `bets/feed`: hướng dẫn dùng cursor pagination thay vì poll lại từ đầu.

Đây là **deliverable bắt buộc**, không phải "nice to have": rate limit không được ghi vào docs sẽ
thành sự cố tích hợp của tenant đầu tiên.

---

# PHẦN B — TEST (viết SAU khi khai báo xong)

> Không lặp lại test của `p0-01`/`p1-01`. Ở đây chỉ test **đặc thù `api-tenant`**: subject là tenant,
> Endpoint 1 có **2 lớp**, và ranh giới cô lập giữa các tenant.

## B0 — Xác nhận môi trường

| # | Việc | Kỳ vọng | Nếu sai |
|---|---|---|---|
| 0a | Redis 8.6 container up | `redis_version:8.6.x` | Dừng |
| 0b | `rg -n REDIS_URI apps/api-tenant/serverless.yml` | Có (dòng 81 — đã verify) | **Có** rồi nên không sửa gì; nếu mất thì báo, không tự thêm |
| 0c | Xác nhận đúng **3** handler được deploy | Đối chiếu `serverless.yml` với `src/handlers/` | Test 3 handler chưa deploy là công vô ích |

## B1 — Unit test (mock rate limiter)

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 1 | `event.tenant.tenantId` → key theo tenant | Key chứa hash tenantId | Đường chính của app này |
| 2 | Thiếu `event.tenant` → **fallback IP** + `logError` | Có key IP **và** spy log | Cấu hình sai không được thành "bỏ qua im lặng" |
| 3 | `tenantId` đã `hashKeyPart()` | Key **không** chứa tenantId nguyên bản | `tenantId` là danh tính đối tác B2B, lộ trong log Redis |
| 4 | 2 tenant khác → 2 key khác; cùng tenant → cùng key | Tất định | Nền của test cô lập #8 |
| 5 | Endpoint 1: **2 lớp** (per-player + per-tenant) cùng được gọi | Spy 2 lần với 2 key khác nhau | Sót 1 lớp = mất nửa phòng thủ mà không ai biết |
| 6 | Endpoint 1: lớp per-player denied → per-tenant **không** bị trừ quota | Kiểm giá trị key per-tenant | Nếu trừ, 1 player xấu làm hụt quota cả tenant → chặn oan mọi player khác |
| 7 | `route` của 3 endpoint **duy nhất**, đúng format, và **đúng số đã chốt** | `new Set(...)`. Login per-player `5/60 burst 0`, per-tenant `10/1 burst 0` (10/giây), feed `3/60 burst 2`, revenue `20/60` | Trùng `route` = dùng chung quota. Sai số per-tenant = không còn đúng 10 login/giây |

## B2 — Integration test (Redis 8.6 thật)

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 8 | **Tenant A vượt ngưỡng KHÔNG ảnh hưởng tenant B** | A nhận 429, B vẫn 200 | **Test quan trọng nhất của plan.** Dễ bỏ sót, hậu quả: 1 tenant làm chết dịch vụ của mọi tenant còn lại — sự cố hợp đồng, không chỉ kỹ thuật |
| 9 | `POST /player/login`: per-player độc lập giữa 2 player **cùng** tenant | Player 1 bị chặn, player 2 vẫn 200 | Lớp per-player phải thật sự per-player |
| 10 | `POST /player/login`: vượt **per-tenant** → chặn cả tenant đó, tenant khác không ảnh hưởng | — | Lớp thứ 2 hoạt động độc lập lớp thứ 1 |
| 11 | 3 endpoint có quota **riêng** | Vượt `login` không làm `bets/feed` bị 429 | `route` nằm trong key |
| 12 | Dưới ngưỡng → **200** suốt ở cả 3 endpoint | Gọi n lần | Không chặn oan — `enforce` là mặc định nên đây là ca thật, không phải giả định |
| 13 | Redis chết → cả 3 endpoint **vẫn 200** | — | Fail-open ở app thật |

## B3 — Không regress

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 14 | `pnpm --filter @megawin/api-tenant test` | Xanh toàn bộ |
| 15 | `pnpm --filter @megawin/api-tenant check-types` | Xanh |
| 16 | `oxlint apps/api-tenant` | Không error |
| 17 | `git diff --stat apps/api-tenant` | **Không** có `serverless.yml`; thân handler/use-case 0 dòng đổi (trừ 1 lời gọi `RateLimiter` ở Endpoint 1) |
| 18 | `git status --short \| rg '\.env'` | **Không kết quả** |
| 19 | `rg -ni 'shadow' apps/api-tenant` | **Không kết quả** — mode shadow không tồn tại |

## B4 — Xác nhận thủ công

1. **Load test staging per-endpoint**: mô phỏng nhịp gọi của tenant dự kiến (batch job, poll loop,
   report theo giờ). Ghi bảng: endpoint | nhịp mô phỏng | ngưỡng đặt | có 429 không. Ngưỡng phải chịu
   được **tenant lớn nhất dự kiến**, không phải tenant trung bình — không có số liệu thật thì chọn
   rộng tay.
2. **Load test 2 lớp của Endpoint 1 cùng lúc**: bắn nhiều player khác nhau trong cùng tenant tới sát
   `limit: 10 / 1 giây` per-tenant → xác nhận per-player (`5/phút`) **không** bị trừ oan và ngược lại. Ghi số.
   Cùng lúc: `bets/feed` ở nhịp 1 lần/phút **không** 429; lần thứ 4 trong cùng phút (sau khi đã xả
   burst 3) **phải** 429.
3. **Xác nhận `tenantId` không lộ**: `KEYS guard:*` trên Redis, đọc bằng mắt.
4. **Xác nhận tài liệu tích hợp đã có bảng ngưỡng** + hướng dẫn xử lý 429 (`Retry-After`, backoff,
   cursor cho `bets/feed`). Ghi link tới trang tài liệu.
5. **Xác nhận van tắt**: `GUARD_RATELIMIT_MODE=off` trên staging → vượt ngưỡng vẫn 200.

## Definition of done

**Phần A (khai báo):**

- [ ] 3 endpoint deployed đã thêm `rateLimit`, chạy `enforce` (mặc định toàn cục).
- [ ] Login: per-player `5/60 burst 0`, per-tenant `10/1 burst 0` (10 login/giây). Feed: `3/60 burst 2`.
      Revenue giữ `20/60` (query nặng, không phải poll — đã rà, không đổi).
- [ ] Endpoint 1 có **cả 2 lớp**; lý do chọn vị trí lớp per-player đã ghi vào code comment.
- [ ] `@megawin/guard` thêm vào `package.json` **chỉ khi** handler gọi trực tiếp `RateLimiter`.
- [ ] **Tài liệu tích hợp tenant** đã có bảng ngưỡng + hướng dẫn xử lý 429 (deliverable bắt buộc).
- [ ] `check-types` + `oxlint` + `prettier` xanh.
- [ ] **Không** sửa `serverless.yml`, **không** sửa `.env*`.

**Phần B (test):**

- [ ] B0: 3 xác nhận môi trường xong (0c: đúng 3 handler deployed).
- [ ] 7 unit test (B1) xanh — đặc biệt **#5–6 (2 lớp độc lập)** và #3 (không lộ `tenantId`).
- [ ] 6 integration test (B2) xanh — **#8 (cô lập tenant) là bắt buộc, không được hoãn**; #12 (dưới
      ngưỡng không chặn oan).
- [ ] B3 #17 xác nhận không đụng `serverless.yml`; #18 không đụng `.env*`; #19 không còn `shadow`.
- [ ] B4 #1–2: **đã ghi bảng load test staging**, gồm ca 2 lớp của Endpoint 1.
- [ ] B4 #3: đã xác nhận `tenantId` không lộ trong key Redis (đọc bằng mắt).
- [ ] B4 #4: đã xác nhận tài liệu tích hợp có bảng ngưỡng, có link.
- [ ] B4 #5: van tắt `off` hoạt động trên staging.
- [ ] Mọi `A-fix` (sửa ngưỡng sau load test) đã ghi lại kèm lý do.

## Không làm trong plan này

- ❌ **Shadow mode** — không còn tồn tại (`p1-01`).
- ❌ Rate limit cho 3 handler chưa deploy (`list-players`, `get-player-detail`, `suspend-player`).
- ❌ Idempotency cho `suspend-player` — endpoint chưa deploy, và idempotent tự nhiên (suspend 2 lần =
  suspend). Nếu sau này cần → `p3-01`.
- ❌ `api-player` → `p1-02`.