# p1-02 — Rollout Rate Limit: `apps/api-player`

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md` §4.1
> Overview: `./00-overview.md` · Phase P1 · Chặn bởi: `p1-01` · Chặn: `p2-01`

Bật `rateLimit` cho endpoint `api-player` theo từng đợt. **Mọi đợt vào `shadow` mode trước.**
Chuyển sang `enforce` là quyết định riêng, cần số liệu từ `p2-01`.

---

# PHẦN A — KHAI BÁO (AI agent implement)

> Plan này **không viết logic mới** — chỉ thêm khai báo `rateLimit` vào options handler.
> Kết thúc Phần A của **mỗi đợt**: `check-types` + `oxlint` xanh, diff **chỉ** ở phần options.
> Test đỏ ở Phần B → sửa khai báo, ghi `A-fix: <lý do>`.

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
3. **Viết test cho đợt đó** (Phần B bên dưới) — xong test mới deploy.
4. Deploy `dev` → chạy shadow → đọc log → điều chỉnh ngưỡng → deploy `prod` shadow.
5. Chỉ sang `enforce` khi `p2-01` cho thấy tỉ lệ vượt ngưỡng của traffic thật ≈ 0.

Mỗi đợt là **một vòng A→B hoàn chỉnh**: khai báo (A) → test (B) → deploy. Không gộp 3 đợt rồi test một
lần cuối — gộp thì không biết đợt nào gây chặn oan.

## Ngưỡng có nên gom 1 chỗ không?

**Không** gom vào file config tập trung. Khai tại handler vì:
- Đọc handler là biết ngay nó được bảo vệ thế nào (cùng tinh thần `require-static-classes`).
- File config tập trung tạo indirection: sửa ngưỡng ở file A ảnh hưởng endpoint ở file B mà review
  không thấy.

Nhưng **hằng số chia sẻ** (vd `POLLING_RATE_LIMIT`) đặt trong `apps/api-player/src/lib/` là hợp lý khi
≥3 endpoint dùng đúng cùng một bộ số — tránh 20 chỗ ghi `limit: 120` rồi lệch nhau.

---

# PHẦN B — TEST (viết SAU khi khai báo của mỗi đợt xong)

> Plan này **không viết logic mới** — chỉ thêm khai báo. Nên test ở đây trả lời đúng 2 câu:
> *"khai báo có đúng chỗ, đúng số không?"* và *"có endpoint nào bị bỏ sót / bật sai không?"*.
> Logic rate limit đã test ở `p0-01`; middleware đã test ở `p1-01` — **không lặp lại** ở đây.

## B1 — Unit test: khai báo là dữ liệu, kiểm được tĩnh

`apps/api-player/test/unit/rate-limit-config.test.ts`

Import options của từng handler rồi assert — không cần Redis, không cần gọi handler.

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 1 | Mọi `route` là **duy nhất** toàn app | Gom tất cả `route` → `new Set(routes).size === routes.length` | 2 endpoint trùng `route` → **dùng chung quota**, chặn oan lẫn nhau. Bug này không thể phát hiện bằng mắt khi có 76 endpoint |
| 2 | `route` đúng format `"{game}.{action}"` | Regex `/^[a-z0-9]+\.[a-z-]+$/` | Sai format phá quy ước debug |
| 3 | `subject` dùng `GuardSubjectType`, **không** string literal | Đối chiếu với `Object.values(GuardSubjectType)` | `code-quality-standards.mdc` §5.3 |
| 4 | `limit` > 0, `windowSec` > 0, `burst` >= 0 | Vòng lặp mọi khai báo | `limit: 0` = chặn 100% — nếu bật `enforce` thì là outage tức thì |
| 5 | Endpoint `place-bet` **không** dùng `subject: "ip"` | — | Mobile NAT/CGNAT: hàng nghìn player chung IP → chặn oan hàng loạt (lý do analysis §4 CUT đề xuất IP-mặc-định) |
| 6 | Endpoint polling có `limit` **cao hơn** endpoint mutation | So cặp cụ thể | Ngưỡng ngược nhau là lỗi copy-paste điển hình |
| 7 | Số endpoint bật rate limit **khớp** danh sách 3 đợt trong plan | `toBe(<số>)` | Chống bật thừa (endpoint không có trong plan) và bật thiếu |

## B2 — Integration test (Redis 8.6 thật, per đợt)

Chỉ cần **1 endpoint tiêu biểu mỗi đợt** — không nhân 3 lần cùng một kịch bản.

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 8 | Đợt 1 (`place-bet`): ở `shadow`, vượt ngưỡng → **200** + có log vượt | Gọi n+1 lần | Xác nhận endpoint **thật** được wire đúng, không chỉ config đẹp |
| 9 | Cùng endpoint, tạm bật `enforce` trong test → 429 ở request n+1 | `statusCode === 429` | Chứng minh khai báo hoạt động, nhưng **không** bật `enforce` ở deploy |
| 10 | 2 account khác nhau → quota độc lập | A 429, B 200 | Cô lập theo subject ở endpoint thật |
| 11 | Đợt 2 (endpoint aggregate) + Đợt 3 (polling): shadow, vượt ngưỡng → 200 | — | Mỗi đợt xác nhận 1 lần |
| 12 | Redis chết → endpoint **vẫn 200** | — | Fail-open ở endpoint thật, không chỉ handler giả |

## B3 — Không regress

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 13 | `pnpm --filter @megawin/api-player test` | Xanh toàn bộ |
| 14 | `pnpm --filter @megawin/api-player check-types` | Xanh |
| 15 | `oxlint apps/api-player` | Không error |
| 16 | `git diff --stat` trên `apps/api-player/src` | **Chỉ** thay đổi ở phần options của handler. Thân handler và use-case **0 dòng thay đổi** — nếu có, đã vi phạm scope |
| 17 | `rg -n 'mode:\s*"enforce"\|GUARD_RATELIMIT_MODE=enforce' apps/api-player` | **Không kết quả** — `enforce` chưa bật ở code lẫn config |

## B4 — Xác nhận thủ công (phần quan trọng nhất của plan này)

Plan này là **rollout**, nên bằng chứng quan trọng nằm ở traffic thật, không ở unit test.

1. **Đối chiếu ngưỡng với p99 thật từ Axiom** cho từng endpoint, **trước** khi chốt số. Ghi lại:
   endpoint | p99 quan sát | ngưỡng đặt | tỉ lệ dư. Ngưỡng **không** được giữ nguyên số suy đoán
   trong plan — đó là điểm khởi đầu để đối chiếu, không phải kết luận.
2. **Đọc log shadow ở `dev` ít nhất 1 chu kỳ traffic** (gồm giờ cao điểm). Ghi: số request, số lần
   vượt ngưỡng, có subject nào vượt bất thường không.
3. **Kiểm tra tỉ lệ vượt của người dùng thật ≈ 0** trước khi cân nhắc `enforce`. Nếu > 0, ngưỡng sai —
   sửa ngưỡng, **không** kết luận "người dùng lạm dụng".
4. **Riêng endpoint polling**: xác nhận countdown client thật (poll 1–3s = 20–60 req/phút) **không**
   chạm ngưỡng. Test tay bằng client thật, không bằng script.

## Definition of done

**Phần A (khai báo):**

- [ ] Đợt 1, 2, 3 đã thêm `rateLimit` đúng endpoint trong danh sách.
- [ ] Không handler nào bị sửa phần thân/use-case — chỉ thêm khai báo options.
- [ ] Hằng chia sẻ (nếu ≥3 endpoint cùng bộ số) đặt ở `apps/api-player/src/lib/`, không rải 20 chỗ.
- [ ] `check-types` + `oxlint` + `prettier` xanh.
- [ ] `enforce` **chưa** bật — ghi rõ trong PR.

**Phần B (test):**

- [ ] 7 unit test (B1) xanh — đặc biệt **#1 (route duy nhất)** và **#7 (số endpoint khớp plan)**.
- [ ] 5 integration test (B2) xanh, phủ cả 3 đợt + fail-open #12.
- [ ] B3 #16 xác nhận diff **chỉ** ở options; #17 xác nhận `enforce` chưa bật.
- [ ] B4: **đã ghi bảng đối chiếu p99 thật** cho từng endpoint (không giữ số suy đoán).
- [ ] B4: đã đọc log shadow ≥1 chu kỳ traffic gồm cao điểm, có số liệu ghi lại.
- [ ] B4: đã test tay countdown client thật không chạm ngưỡng polling.
- [ ] Mọi `A-fix` (sửa ngưỡng sau khi test) đã ghi lại kèm lý do.


## Không làm trong plan này

- ❌ Bật `enforce`.
- ❌ `api-tenant` → `p1-03`.
- ❌ Metrics/dashboard → `p2-01`.
- ❌ Sửa micro-cache/TTL của `docs/cache` Phase 2 — độc lập, đừng trộn.
