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
| Thuật toán rate limit | **GCRA** qua 1 lệnh Lua `EVAL` | 1 RTT, 1 key, trả luôn `retryAfterMs`. Lambda chạy **ngoài VPC** nên mỗi RTT là chi phí thật (analysis §3.2) |
| Idempotency `place-bet` | **Mongo-native**: `tx` dẫn xuất tất định + unique index `{tx}` trên WAL | **0 RTT thêm**, bền bằng chính giao dịch, không thêm điểm chết (analysis §3.3 phương án B) |
| `Idempotency-Key` | **Tùy chọn** + **fingerprint guard** khi không gửi | Bắt double-tap mà tenant không phải đổi code; không breaking change (analysis §5.2) |
| Redis down | Rate limit + fingerprint guard **fail-open**; nhánh có `Idempotency-Key` **không phụ thuộc Redis** | Phòng thủ không được tự tạo sự cố; ràng buộc tài chính thì dựa vào Mongo (analysis §3.4) |
| Thư viện ngoài | **Không** dùng `rate-limiter-flexible` / `@upstash/ratelimit` | Sẽ tạo hệ key thứ hai không qua `CacheNamespace` registry — trái `cache-design.mdc` §2.1 |
| Bật chặn ngay | **Không** — shadow mode (log-only) trước | Ngưỡng hiện tại là suy đoán, chưa có số liệu thật |

## Bảng trạng thái

| Plan | Phase | Status | Ghi chú |
|---|---|---|---|
| `p0-01-guard-package-foundation` | P0 | ⏳ pending | Chặn mọi plan khác |
| `p0-02-idempotent-place-bet` | P0 | ⏳ pending | **Ưu tiên nghiệp vụ cao nhất** — vá bug tài chính |
| `p1-01-ratelimit-middleware` | P1 | ⏳ pending | Shadow mode bật trước khi chặn |
| `p1-02-rollout-api-player` | P1 | ⏳ pending | |
| `p1-03-rollout-api-tenant` | P1 | ⏳ pending | Song song được với `p1-02` |
| `p2-01-observability` | P2 | ⏳ pending | Bắt buộc trước khi tắt shadow mode |
| `p3-01-generic-idempotency-store` | P3 | 🧊 deferred | Chỉ khi operator/mutation không-WAL xuất hiện |

## Thứ tự phụ thuộc

```
p0-01 (foundation: @megawin/guard + eval/evalSha + Lua GCRA)
  │
  ├──→ p0-02 (idempotent place-bet)  ← ưu tiên nghiệp vụ cao nhất
  │
  ├──→ p1-01 (ratelimit middleware + shadow mode)
  │       ├──→ p1-02 (rollout api-player) ──→ p2-01 (observability)
  │       └──→ p1-03 (rollout api-tenant)
  │
  └──→ p3-01 (generic idempotency store — deferred)
```

Ghi chú về thứ tự: `p0-02` **cần** `p0-01` chỉ vì nhánh **fingerprint guard** (không có
`Idempotency-Key`) dùng Redis. Nhánh **có** `Idempotency-Key` hoàn toàn Mongo-native. Nếu cần ship
gấp phần vá tài chính, có thể làm `p0-02` nhánh Mongo trước và hoãn fingerprint guard — nhưng khi đó
tenant chưa cập nhật SDK **vẫn không được bảo vệ**, phải nêu rõ khi quyết.

`p1-02` và `p1-03` độc lập nhau, chạy song song được.

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
