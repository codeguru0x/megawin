# Guard — Rate Limiting & Idempotency

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md`
> Ngày chốt scope: 2026-09-20

Dựng **một** lớp phòng thủ dùng chung (`@megawin/guard`) hook vào `buildHandler()` — cửa ngõ duy nhất
của ~76 endpoint `api-player` + `api-tenant`. Hai năng lực: **rate limit** (GCRA/Redis) và
**idempotency** (Mongo-native cho đường tiền).

**Mục tiêu số 1 không phải rate limit** mà là vá một bug tài chính đang mở: `place-bet` hiện cho phép
duplicate submit → 2 vé + 2 lần debit ví thật (analysis §2.3). Xem `p0-02`.

## Quyết định đã chốt (không mở lại trong plan)

| Quyết định | Chốt | Lý do gọn |
|---|---|---|
| Thuật toán rate limit | **GCRA** qua 1 lệnh Lua `EVAL` | 1 RTT, 1 key, trả luôn `retryAfterMs`. Lambda chạy **ngoài VPC** nên mỗi RTT là chi phí thật (analysis §3.2). **Redis 8.6 không có lệnh native nào thay được** — xem mục dưới |
| Redis version & Lua | **Redis 8.6**; Lua `EVAL` là lựa chọn **duy nhất**, không phải tạm bợ | Verify 2026-09-21: 8.6 không có lệnh rate limit native. Lệnh `GCRA` (PR #14826, dựa redis-cell) có ở 8.8-M02 nhưng **bị rút trước GA** (PR #15191 — compile out, command inaccessible). 8.8 chỉ có `INCREX` (window counter), 8.10 không thêm. `CL.THROTTLE` là module redis-cell, **không** bundle trong image official |
| Image test container | **Pin `redis:8.6`** = đúng version prod | Tag `redis:8` là floating — 2026-09-21 resolve ra **8.10.1**, lệch 2 minor với prod. Sửa ở `p0-00` B0.1 |
| Idempotency `place-bet` | **Mongo-native**: `tx` dẫn xuất tất định + unique index `{tx}` trên WAL | **0 RTT thêm**, bền bằng chính giao dịch, không thêm điểm chết (analysis §3.3 phương án B) |
| `Idempotency-Key` | **Tùy chọn** + **fingerprint guard** khi không gửi | Bắt double-tap mà tenant không phải đổi code; không breaking change (analysis §5.2) |
| Redis down | Rate limit + fingerprint guard **fail-open**; nhánh có `Idempotency-Key` **không phụ thuộc Redis** | Phòng thủ không được tự tạo sự cố; ràng buộc tài chính thì dựa vào Mongo (analysis §3.4) |
| Fail-open phải **sửa ở tầng `@megawin/cache` trước** | `p0-00` chặn `p0-01` | Đo 2026-09-21: `@megawin/cache` **chưa** thật sự fail-open — Redis down làm `connect()` retry vô hạn, **treo tới Lambda timeout** (12s+ chưa settle). Dựng guard trên nền này = guard cũng treo |
| Thư viện ngoài | **Không** dùng `rate-limiter-flexible` / `@upstash/ratelimit` | Sẽ tạo hệ key thứ hai không qua `CacheNamespace` registry — trái `cache-design.mdc` §2.1 |
| Bật chặn ngay | **Không** — shadow mode (log-only) trước | Ngưỡng hiện tại là suy đoán, chưa có số liệu thật |

## Bảng trạng thái

Mỗi plan có **2 cột trạng thái tách biệt**: `Code` (AI agent implement production code) và `Test`
(viết sau, testcontainer thật). **`Code` xanh mà `Test` chưa xanh thì plan CHƯA xong** — không tính là
hoàn thành, không được sang plan sau.

Ký hiệu: ⏳ pending · 🔄 in-progress · ✅ done · ❌ failing · 🧊 deferred · ➖ không áp dụng

| Plan | Phase | Code | Test | Ghi chú |
|---|---|---|---|---|
| `p0-00-redis-failopen-hardening` | P0 | ✅ done | ⏳ pending | Fail-open tầng connect đã vá (Phần A 2026-09-21). Phần B test để sau |
| `p0-01-guard-package-foundation` | P0 | ⏳ pending | ⏳ pending | Chặn mọi plan khác |
| `p0-02-idempotent-place-bet` | P0 | ⏳ pending | ⏳ pending | **Ưu tiên nghiệp vụ cao nhất** — vá bug tài chính |
| `p1-01-ratelimit-middleware` | P1 | ⏳ pending | ⏳ pending | Shadow mode bật trước khi chặn |
| `p1-02-rollout-api-player` | P1 | ⏳ pending | ⏳ pending | |
| `p1-03-rollout-api-tenant` | P1 | ⏳ pending | ⏳ pending | Song song được với `p1-02` |
| `p2-01-observability` | P2 | ⏳ pending | ⏳ pending | Bắt buộc trước khi tắt shadow mode |
| `p3-01-generic-idempotency-store` | P3 | 🧊 deferred | 🧊 deferred | Chỉ khi operator/mutation không-WAL xuất hiện |

## Thứ tự phụ thuộc

```
p0-00 (sửa fail-open @megawin/cache: connect timeout + circuit breaker)
  │
  └──→ p0-01 (foundation: @megawin/guard + eval/evalSha + Lua GCRA)
         │
         ├──→ p0-02 (idempotent place-bet)  ← ưu tiên nghiệp vụ cao nhất
         │
         ├──→ p1-01 (ratelimit middleware + shadow mode)
         │       ├──→ p1-02 (rollout api-player) ──→ p2-01 (observability)
         │       └──→ p1-03 (rollout api-tenant)
         │
         └──→ p3-01 (generic idempotency store — deferred)
```

`p0-00` **chặn cứng** `p0-01`: `RateLimiter` của `p0-01` hứa "Redis lỗi → trả `{allowed: true,
failedOpen: true}`". Lời hứa đó **không thực hiện được** trên code hiện tại vì `getClient()` treo
trước khi tới được `try/catch`. Làm `p0-01` trước = viết test fail-open **xanh giả** (test dùng
Redis sống hoặc URI sai cú pháp, không phải Redis không tới được).

Ghi chú về thứ tự: `p0-02` **cần** `p0-01` chỉ vì nhánh **fingerprint guard** (không có
`Idempotency-Key`) dùng Redis. Nhánh **có** `Idempotency-Key` hoàn toàn Mongo-native. Nếu cần ship
gấp phần vá tài chính, có thể làm `p0-02` nhánh Mongo trước và hoãn fingerprint guard — nhưng khi đó
tenant chưa cập nhật SDK **vẫn không được bảo vệ**, phải nêu rõ khi quyết.

`p1-02` và `p1-03` độc lập nhau, chạy song song được.

## Ràng buộc test — áp dụng cho MỌI plan trong thư mục này

### Tách biệt Code và Test — bắt buộc

Mỗi plan chi tiết chia làm **2 phần tách rời**, không trộn:

| Phần | Nội dung | Điều kiện kết thúc |
|---|---|---|
| **PHẦN A — CODE** | Chỉ code production trong `src/`. **Không** viết test ở đây | `check-types` xanh + `oxlint` không error |
| **PHẦN B — TEST** | Chỉ file trong `test/`. **Không** sửa `src/` | Toàn bộ test xanh + xác nhận thủ công đã ghi số đo |

Ba luật không được vi phạm:

1. **Không viết test cùng lúc với code.** Viết code trước, xong hết Phần A mới sang Phần B. Viết song
   song sẽ dẫn tới test được "uốn" theo implementation thay vì theo yêu cầu.
2. **Test đỏ = code sai, không phải test sai.** Không được sửa expectation để test xanh. Phải quay lại
   Phần A và ghi lại thành dòng `A-fix: <lý do>`. Danh sách A-fix là tín hiệu chỗ nào thiết kế
   chưa đúng từ đầu — thông tin có giá trị, đừng làm mất.
3. **Không `skip`/`todo`/comment-out test để plan "xong".** Test chưa chạy được (VD Docker chưa bật)
   → cột `Test` ở bảng trạng thái giữ ⏳, plan **chưa** hoàn thành.

### Testcontainers — hạ tầng dùng chung, không tự dựng

- Redis: `globalSetup: ["@megawin/vitest-config/global-setup-redis"]` → `process.env.REDIS_URI`.
- Mongo: `globalSetup: ["@megawin/vitest-config/global-setup-mongo"]`.
- **CẤM** `new RedisContainer().start()` / `new MongoDBContainer().start()` trực tiếp trong test —
  phải qua `getSharedRedisContainer()`/`getSharedMongoContainer()` (singleton + `withReuse`), xem
  `.cursor/plans/testcontainers-setup/00-overview.md`.
- Image Redis pin **`redis:8.6`** (khớp prod). Sửa `tooling/vitest-config/src/testcontainers/redis-container.ts`
  rồi **build lại** `@megawin/vitest-config` (consumer import từ `dist/`).
- `fileParallelism: false` cho project integration + `flushDb()`/cleanup trong `beforeEach`
  (`test-data-safety.mdc`) — không có thì file A xoá data file B đang test.
- Xác nhận version **trước** khi tin kết quả test:
  `docker exec <c> redis-cli INFO server | grep redis_version` → phải là `8.6.x`.

### Chia tầng test

| Tầng | Chạy bằng | Nội dung | Không được chứa |
|---|---|---|---|
| Unit (`test/unit/`) | `pnpm --filter <pkg> test:unit` | Logic **pure**: công thức, key builder, state machine, resolve subject | Redis, Mongo, network, `Date.now()` ngầm (phải inject `nowMs`) |
| Integration (`test/integration/`) | `pnpm --filter <pkg> test:integration` | Redis/Mongo thật qua Testcontainers, hành vi end-to-end của middleware | Mock của chính thứ đang test |

Logic có **công thức** (GCRA math, `deriveTx`, canonical body) **phải** tách ra file pure riêng để
unit test được không cần container. Đây cũng là nơi bug ngưỡng/tiền dễ lọt nhất.

### Mỗi bảng test trong plan phải có cột "Cách xác nhận PASS"

Không viết "test rate limit hoạt động". Phải viết được assertion cụ thể và **vì sao test đó tồn tại**.
Test dùng **hằng số thật** (`REDIS_CIRCUIT_OPEN_MS`), không hard-code số ma (`5000`) — đổi hằng mà
test vẫn xanh nghĩa là test không khoá gì.

### Xác nhận thủ công — không thay bằng test tự động

Một số hành vi chỉ chứng minh được bằng tay; plan nào có thì **phải ghi lại số đo/kết quả**, không ghi
"đã kiểm tra":

- Đo thời gian **trước/sau** khi sửa (fail-open, latency thêm do guard).
- `docker stop` → gọi API → `docker start` → gọi lại (blip mạng, tự phục hồi).
- Test đường tiền: đếm **số vé** và **số lần debit** thực tế trong DB, không chỉ đọc HTTP status.

## Ràng buộc xuyên suốt mọi plan

- **Không** đưa logic phòng thủ vào use-case — thuộc middleware (`app-use-case-layering.mdc` §1,
  handler phải mỏng).
- **Không** biến guard thành cache cho các đường `docs/cache/04` đã cấm cache: `place-bet` validate
  draw realtime, balance callbacks, WAL/TxIntent.
- Message lỗi trả client là **UI tiếng Việt**, không lộ tên class/field/collection
  (`error-handling-conventions.mdc`). Throw `AppException`, không `new Error`.
- Key Redis đăng ký qua `CacheNamespace` + `cacheKey()`; phần do client kiểm soát phải `hashKeyPart()`.
- Sửa DTO/response `api-player` → **bắt buộc** đồng bộ `packages/player-sdk` cùng PR
  (`api-player-sdk-sync.mdc`) — không có compiler bảo vệ.
- Mỗi plan xong: `oxlint <paths>` + `prettier --write <paths>` (`oxlint-lint-conventions.mdc` §g).
