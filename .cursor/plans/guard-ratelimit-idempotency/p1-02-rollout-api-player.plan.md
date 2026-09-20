# p1-02 — Rollout Rate Limit: `apps/api-player`

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md` §4.1
> Overview: `./00-overview.md` · Phase P1 · Chặn bởi: `p1-01` · Chặn: `p2-01`

Bật `rateLimit` cho endpoint `api-player` theo từng đợt. **Mọi đợt vào `shadow` mode trước.**
Chuyển sang `enforce` là quyết định riêng, cần số liệu từ `p2-01`.

## Nguyên tắc rollout

1. **Shadow trước, enforce sau.** Không có ngoại lệ, kể cả `place-bet`.
2. **Đợt nhỏ, theo mức độ rủi ro**, không bật 76 endpoint một lần.
3. Ngưỡng dưới đây là **điểm khởi đầu suy đoán** — phải đối chiếu p99 thật từ Axiom
   (dataset `megawin-player-prod`/`megawin-player-dev`, đã cấu hình `serverless.yml`) rồi mới chốt.
4. Endpoint càng **đắt mỗi request** thì ngưỡng càng **chặt** — đây là tiêu chí xếp hạng chính.

## Đợt 1 — Rủi ro cao nhất (2 endpoint)

| Endpoint | Handler | Rule đề xuất |
|---|---|---|
| `POST /games/{game}/bets` ×7 | `handlers/{game}/place-bet.ts` | `limit: 30, windowSec: 60, burst: 5, subject: "account"` |
| `POST /auth/refresh-token` | `handlers/auth/refresh-token.ts` | `limit: 10, windowSec: 60, subject: "ip"` |

- `place-bet`: `route` **riêng cho từng game** (`"keno.place-bet"`, `"mega645.place-bet"`…) — không
  dùng chung 1 route key, vì player chơi nhiều game cùng lúc là hành vi hợp lệ.
- `burst: 5`: đặt nhiều vé liên tiếp là hành vi thật (chọn xong bấm liền). Đây là lý do chọn GCRA —
  tách `limit` (rate) khỏi `burst` (analysis §3.2).
- `refresh-token` dùng `withPublicHandler` → **không có identity**, chỉ IP. Chống brute-force token.
  ⚠️ Đây là endpoint dễ chặn oan nhất vì CGNAT → shadow mode ở đây phải chạy **lâu hơn** các endpoint khác.

## Đợt 2 — Endpoint aggregate/nặng (4 route)

Đắt nhất mỗi request nên ngưỡng chặt nhất.

| Endpoint | Rule đề xuất | Vì sao chặt |
|---|---|---|
| `GET /games/{game}/draws/{drawId}/combo-popularity` — **4 game** (keno, lotto535, mega645, power655) | `limit: 20, windowSec: 60, subject: "account"` | Query aggregate thống kê |
| `GET /games/jackpots` | `limit: 30, windowSec: 60, subject: "account"` | `ListJackpotsUseCase` fan-out nhiều use-case → 1 request = nhiều query |

Số lượng đã verify bằng `ls`: `get-combo-popularity.ts` có **4 file** (keno, lotto535, mega645,
power655) và `get-jackpot.ts` có **3 file** (lotto535, mega645, power655 — keno không có jackpot).

## Đợt 3 — Polling endpoint (ngưỡng lỏng)

Mục đích ở đây **không** phải chống abuse mà **bảo vệ Mongo** khỏi poll storm. Bổ trợ cho micro-cache
của `docs/cache/04` Phase 2, không thay thế.

| Nhóm | Rule đề xuất |
|---|---|
| `GET /games/{game}/draws/current` ×7 | `limit: 120, windowSec: 60, subject: "account"` |
| `GET /games/{game}/jackpot` — **3 game** (lotto535, mega645, power655) | `limit: 120, windowSec: 60, subject: "account"` |
| `GET /games/{game}/tickets`, `tickets/pending`, `tickets/{id}/entries`, `entries/{id}/lines` | `limit: 60, windowSec: 60, subject: "account"` |
| `GET /games/{game}/draw-results`, `draw-results/{drawId}` | `limit: 60, windowSec: 60, subject: "account"` |
| `GET /games/{game}/config` ×7 | `limit: 60, windowSec: 60, subject: "account"` |

Cảnh báo cụ thể: countdown client thường poll `draws/current` mỗi 1–3s → **20–60 req/phút là bình
thường**. Ngưỡng 120 chỉ chặn hành vi bất thường rõ rệt. Đặt thấp hơn là chặn người dùng thật.

## Cách làm mỗi đợt

1. Thêm `rateLimit: { … }` vào options của handler — **không** đụng thân handler, không đụng use-case.
2. `route` đặt theo `"{game}.{action}"`, khai **tĩnh** tại chỗ (đọc được bằng mắt).
3. Deploy `dev` → chạy shadow → đọc log → điều chỉnh ngưỡng → deploy `prod` shadow.
4. Chỉ sang `enforce` khi `p2-01` cho thấy tỉ lệ vượt ngưỡng của traffic thật ≈ 0.

## Ngưỡng có nên gom 1 chỗ không?

**Không** gom vào file config tập trung. Khai tại handler vì:
- Đọc handler là biết ngay nó được bảo vệ thế nào (cùng tinh thần `require-static-classes`).
- File config tập trung tạo indirection: sửa ngưỡng ở file A ảnh hưởng endpoint ở file B mà review
  không thấy.

Nhưng **hằng số chia sẻ** (vd `POLLING_RATE_LIMIT`) đặt trong `apps/api-player/src/lib/` là hợp lý khi
≥3 endpoint dùng đúng cùng một bộ số — tránh 20 chỗ ghi `limit: 120` rồi lệch nhau.

## Definition of done

- [ ] Đợt 1 bật shadow ở `dev` + `prod`, có log thật.
- [ ] Ngưỡng đã đối chiếu p99 thật từ Axiom, **không** giữ nguyên số suy đoán trong plan.
- [ ] Đợt 2, 3 bật shadow.
- [ ] Không handler nào bị sửa phần thân/use-case — chỉ thêm khai báo options.
- [ ] `check-types` + `oxlint` + `prettier` xanh.
- [ ] `enforce` **chưa** bật — là quyết định sau `p2-01`, ghi rõ trong PR.

## Không làm trong plan này

- ❌ Bật `enforce`.
- ❌ `api-tenant` → `p1-03`.
- ❌ Metrics/dashboard → `p2-01`.
- ❌ Sửa micro-cache/TTL của `docs/cache` Phase 2 — độc lập, đừng trộn.
