# Guard — Rate Limiting & Idempotency

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md`
> Ngày chốt scope: 2026-09-20

Dựng **một** lớp phòng thủ dùng chung (`@megawin/guard`) hook vào `buildHandler()` — cửa ngõ duy nhất
của ~76 endpoint `api-player` + `api-tenant`. Hai năng lực: **rate limit** (GCRA/Redis) và
**idempotency** (Mongo-native cho đường tiền).

**Mục tiêu số 1 không phải rate limit** mà là vá một bug tài chính đang mở: `place-bet` hiện cho phép
duplicate submit → 2 vé + 2 lần debit ví thật (analysis §2.3). Xem `p0-02`.

## Bối cảnh: chưa deploy production (chốt 2026-09-22)

Hệ thống **chưa deploy production, chưa tenant nào tích hợp thật**. Hệ quả cho toàn bộ bộ plan:

| Bỏ | Lý do |
|---|---|
| **Back-compat / dual-path** | Không có client cũ cần chiều. Giữ nhánh cũ = rác code ngay từ lúc sinh ra |
| **Shadow mode** (rate limit) | Tồn tại để thu số liệu traffic thật trước khi chặn — chưa có traffic thật. Thay bằng **load test staging** |
| **Fingerprint guard** (idempotency nhánh B) | Tồn tại để che cho client chưa gửi `Idempotency-Key` — header giờ **bắt buộc**, không còn gì cần che |
| **Chia đợt rollout** | Tồn tại để giới hạn bán kính sự cố khi có user thật. Không có user thật thì chỉ là 3 lần lặp + giai đoạn nửa vời không ai theo dõi |
| **Thông báo trước cho tenant** (429) | Chưa tenant nào chạy. Thay bằng **ghi ngưỡng vào tài liệu tích hợp** ngay từ đầu |
| **Đếm trùng dữ liệu production** trước khi tạo unique index | Không có dữ liệu production. Staging trùng → drop collection |

**Deploy staging = trạng thái cuối:** mọi nơi đã cập nhật, `enforce` đã bật, `Idempotency-Key` đã bắt
buộc. Không có giai đoạn chuyển tiếp nào cần duy trì.

Giữ lại (vẫn cần thật): **fail-open** khi Redis chết, **van tắt `off` qua env**, và toàn bộ ràng buộc
test/đường tiền.

## Quyết định đã chốt (không mở lại trong plan)

| Quyết định | Chốt | Lý do gọn |
|---|---|---|
| Thuật toán rate limit | **GCRA** qua 1 lệnh Lua `EVAL` | 1 RTT, 1 key, trả luôn `retryAfterMs`. Lambda chạy **ngoài VPC** nên mỗi RTT là chi phí thật (analysis §3.2). **Redis 8.6 không có lệnh native nào thay được** — xem mục dưới |
| Redis version & Lua | **Redis 8.6**; Lua `EVAL` là lựa chọn **duy nhất**, không phải tạm bợ | Verify 2026-09-21: 8.6 không có lệnh rate limit native. Lệnh `GCRA` (PR #14826, dựa redis-cell) có ở 8.8-M02 nhưng **bị rút trước GA** (PR #15191 — compile out, command inaccessible). 8.8 chỉ có `INCREX` (window counter), 8.10 không thêm. `CL.THROTTLE` là module redis-cell, **không** bundle trong image official |
| Image test container | **Pin `redis:8.6`** = đúng version prod | Tag `redis:8` là floating — 2026-09-21 resolve ra **8.10.1**, lệch 2 minor với prod. Sửa ở `p0-00` B0.1 |
| Idempotency `place-bet` | **Mongo-native**: `tx` dẫn xuất tất định + unique index `{tx}` trên WAL | **0 RTT thêm**, bền bằng chính giao dịch, không thêm điểm chết (analysis §3.3 phương án B) |
| `Idempotency-Key` | **BẮT BUỘC** (thiếu → 400). `generateTx()` bị xoá | Chưa có client cũ → một đường duy nhất, không fingerprint guard, không Redis trên đường tiền (2026-09-22, thay quyết định cũ "tùy chọn + fingerprint") |
| Redis down | Rate limit **fail-open**; `place-bet` **không phụ thuộc Redis** chút nào | Phòng thủ không được tự tạo sự cố; ràng buộc tài chính dựa 100% vào Mongo (analysis §3.4) |
| Thư viện ngoài | **Không** dùng `rate-limiter-flexible` / `@upstash/ratelimit` | Sẽ tạo hệ key thứ hai không qua `CacheNamespace` registry — trái `cache-design.mdc` §2.1 |
| Mode rate limit | **2 mode**: `enforce` (mặc định) + `off` (van tắt qua env). **Không** có `shadow` | Chưa có traffic thật để thu số liệu; hiệu chỉnh ngưỡng bằng load test staging (2026-09-22) |
| Fail-open phải **sửa ở tầng `@megawin/cache` trước** | `p0-00` chặn `p0-01` | Đo 2026-09-21: `@megawin/cache` **chưa** thật sự fail-open — Redis down làm `connect()` retry vô hạn, **treo tới Lambda timeout** (12s+ chưa settle). Dựng guard trên nền này = guard cũng treo |

## Bảng trạng thái

Mỗi plan có **2 cột trạng thái tách biệt**: `Code` (AI agent implement production code) và `Test`
(viết sau, testcontainer thật). **`Code` xanh mà `Test` chưa xanh thì plan CHƯA xong** — không tính là
hoàn thành, không được sang plan sau.

Ký hiệu: ⏳ pending · 🔄 in-progress · ✅ done · ❌ failing · 🧊 deferred · ➖ không áp dụng

| Plan | Phase | Code | Test | Ghi chú |
|---|---|---|---|---|
| `p0-00-redis-failopen-hardening` | P0 | ✅ done | ⏳ pending | Fail-open tầng connect đã vá (Phần A 2026-09-21). Phần B test để sau |
| `p0-01-guard-package-foundation` | P0 | ✅ done | ✅ done | Code 2026-09-21, Test 2026-09-22 (13 unit + 14 integration) |
| `p0-01b-lua-eval-review-fixes` | P0 | ✅ done | ✅ done | Code + Test 2026-09-23 (23 unit + 30 integration). Q1=B, Q2=A. **Mở `p1-01`** |
| `p0-02-idempotent-place-bet` | P0 | ⏳ pending | ⏳ pending | **Ưu tiên nghiệp vụ cao nhất** — vá bug tài chính. **Độc lập hoàn toàn** (fingerprint guard đã bỏ → 0 Redis) |
| `p1-01-ratelimit-middleware` | P1 | ⏳ pending | ⏳ pending | 2 mode: `enforce` (mặc định) + `off`. **Không** có shadow |
| `p1-02-rollout-api-player` | P1 | ⏳ pending | ⏳ pending | Bật hết 1 lần, `enforce` ngay |
| `p1-03-rollout-api-tenant` | P1 | ⏳ pending | ⏳ pending | Song song được với `p1-02` |
| `p2-01-observability` | P2 | ⏳ pending | ⏳ pending | Không còn chặn việc bật `enforce`; giá trị chính là **alert fail-open** |
| `p3-01-generic-idempotency-store` | P3 | 🧊 deferred | 🧊 deferred | Chỉ khi operator/mutation không-WAL xuất hiện |

## Thứ tự phụ thuộc

```
p0-00 (sửa fail-open @megawin/cache: connect timeout + circuit breaker)
  │
  ├──→ p0-01 (foundation: @megawin/guard + eval/evalSha + Lua GCRA)
  │      │
  │      ├──→ p0-01b (sửa lỗi Lua EVAL: SHA local, clamp ei, trần connect)
  │      │       │
  │      │       └──→ p1-01 (ratelimit middleware, enforce mặc định)
  │      │               ├──→ p1-02 (rollout api-player) ──→ p2-01 (observability/alert)
  │      │               └──→ p1-03 (rollout api-tenant)
  │      │
  │      └──→ p3-01 (generic idempotency store — deferred)
  │
p0-02 (idempotent place-bet) — ĐỘC LẬP, không chặn bởi plan nào, làm được ngay
```

`p0-02` **không còn phụ thuộc gì** (đổi 2026-09-22): trước đây cần `p0-01` vì nhánh fingerprint guard
dùng Redis. Nhánh đó đã bị loại → `place-bet` idempotency 100% Mongo-native. Đây là plan ưu tiên cao
nhất nên thứ tự mới có lợi thật: làm ngay, không chờ chuỗi `p0-00 → p0-01 → p0-01b`.

`p0-01b` chặn `p1-01` (không chặn `p0-02`): Q2 giữ nguyên giá trị `remainingBurst`, nhưng đổi
**object identity** của decision fail-open và khoá contract lower-bound mà `p1-01` map ra header.
Middleware viết trước dễ mutate shared reference hoặc "sửa" công thức Lua. `p0-02` không đụng
`RateLimiter` nên chạy song song được.

`p0-00` **chặn cứng** `p0-01`: `RateLimiter` của `p0-01` hứa "Redis lỗi → trả `{allowed: true,
failedOpen: true}`". Lời hứa đó **không thực hiện được** trên code hiện tại vì `getClient()` treo
trước khi tới được `try/catch`. Làm `p0-01` trước = viết test fail-open **xanh giả** (test dùng
Redis sống hoặc URI sai cú pháp, không phải Redis không tới được).

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
