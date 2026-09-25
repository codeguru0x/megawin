---
name: ""
overview: ""
todos: []
isProject: false
---

# p1-02 — Rollout Rate Limit: `apps/api-player`

> Nguồn: `.cursor/analysis/system-ratelimit-idempotency.analysis.md` §4.1
> Overview: `./00-overview.md` · Phase P1 · Chặn bởi: `p1-01` · Chặn: `p2-01`

Bật `rateLimit` cho endpoint `api-player`. **Một lần, tất cả endpoint trong danh sách, `enforce` ngay.**

> **Bối cảnh đã chốt (2026-09-22): chưa deploy production, chưa có user thật.** Vì vậy bỏ:
> - **Shadow mode** — không còn tồn tại (`p1-01`).
> - **Chia 3 đợt** — chia đợt tồn tại để giới hạn bán kính sự cố khi có traffic thật. Không có traffic
>   thật thì 3 đợt chỉ là 3 lần lặp cùng một việc, và tạo giai đoạn nửa vời (một nửa endpoint có bảo
>   vệ, một nửa không) mà không ai theo dõi.
> - **Đối chiếu p99 Axiom production** — chưa có production. Thay bằng **load test staging**.
>
> Deploy staging = trạng thái cuối: **mọi endpoint trong danh sách đã bật, `enforce`**.

---

# PHẦN A — KHAI BÁO (AI agent implement)

> Plan này **không viết logic mới** — chỉ thêm khai báo `rateLimit` vào options handler.
> Kết thúc Phần A của **mỗi đợt**: `check-types` + `oxlint` xanh, diff **chỉ** ở phần options.
> Test đỏ ở Phần B → sửa khai báo, ghi `A-fix: <lý do>`.

## Nguyên tắc

1. **Bật hết trong 1 PR, `enforce` ngay.** Không chia đợt, không shadow.
2. **`place-bet` không phải số suy đoán.** Ngưỡng là ràng buộc thao tác người chơi (chốt 2026-09-25,
   xem Nhóm 1). Load test chỉ xác nhận người chọn số thật không bị 429, và script nhanh hơn 5 giây
   thì bị chặn. **Không** nới lên 30/phút vì "rộng tay".
3. Các endpoint còn lại: ngưỡng là điểm khởi đầu, hiệu chỉnh bằng **load test staging** (B4).
4. Endpoint càng **đắt mỗi request** thì ngưỡng càng **chặt** — trừ `place-bet`, nơi tiêu chí chính
   là thời gian thao tác người, không phải giá query.
5. **Rộng tay khi chưa chắc** chỉ áp dụng nhóm polling / aggregate. Không áp dụng `place-bet`.

## Nhóm 1 — Mutation / auth (rủi ro cao nhất)

| Endpoint | Handler | Rule |
|---|---|---|
| `POST /games/{game}/bets` ×7 | `handlers/{game}/place-bet.ts` | `limit: 1, windowSec: 5, burst: 0, subject: "account"` |
| `POST /auth/refresh-token` | `handlers/auth/refresh-token.ts` | `limit: 10, windowSec: 60, subject: "ip"` |

### `place-bet` — 1 lần / 5 giây, **chung** mọi game, theo player

Chốt 2026-09-25. Thay số cũ của analysis (`30/phút`, `burst: 5`, route riêng từng game).

Người chơi phải chọn số và tiền cược trước khi bấm. Cùng lúc chỉ chơi được **một** game. Hai lần
đặt cách nhau dưới 5 giây không phải thao tác người — đó là client viết tool bắn cược để flood
đường tiền (mỗi request còn debit ví).

GCRA với `burst: 0` (mặc định repo) = **spacing tuyệt đối**:

| | |
|---|---|
| Rule | `{ limit: 1, windowSec: 5, burst: 0 }` |
| `emissionIntervalMs` | `floor(5000 / 1) = 5000` |
| Lần 1 | Cho qua ngay |
| Lần 2 trước khi đủ 5 giây | **429**, `Retry-After` làm tròn lên từ thời gian còn lại |

- `route` **chung** cả 7 handler: `"player.place-bet"`. `subject: "account"`. Quota là **mỗi player**,
  không phải mỗi game.
- **Không** tách `"keno.place-bet"` / `"mega645.place-bet"`. Tách route thì tool bắn 7 game song song
  vẫn được 7 vé mỗi 5 giây (= 84 vé/phút) — đúng kiểu flood cần chặn. Player không chơi 2 game cùng
  lúc nên chung quota không chặn oan.
- `burst: 0` bắt buộc, khai tường minh (đừng dựa mặc định rồi ai đó thêm burst sau). "Chọn xong bấm
  liền vài vé" **không** còn là hành vi được phép.
- Cả 7 handler dùng **một hằng** `PLACE_BET_RATE_LIMIT` ở `apps/api-player/src/lib/` — cùng `route`,
  cùng số. Literal rải 7 chỗ sẽ lệch.
- Idempotency (`p0-02`) vẫn độc lập: bấm lại **cùng** vé trong 5 giây là replay, không phải lần cược
  mới. Rate limit chặn lần **mới** quá sớm; idempotency chặn trừ tiền hai lần.

- `refresh-token` dùng `withPublicHandler` → **không có identity**, chỉ IP. Chống brute-force token.
  ⚠️ Đây là endpoint dễ chặn oan nhất vì CGNAT (hàng nghìn player mobile chung IP). `limit: 10` là
  **điểm khởi đầu cần load test kỹ nhất** — phải thử ca "nhiều player chung 1 IP" (B4 #3) trước khi chốt.

## Nhóm 2 — Endpoint aggregate/nặng (4 route)

Đắt nhất mỗi request nên ngưỡng chặt nhất.

| Endpoint | Rule | Vì sao chặt |
|---|---|---|
| `GET /games/{game}/draws/{drawId}/combo-popularity` — **4 game** (keno, lotto535, mega645, power655) | `limit: 20, windowSec: 60, subject: "account"` | Query aggregate thống kê |
| `GET /games/jackpots` | `limit: 30, windowSec: 60, subject: "account"` | `ListJackpotsUseCase` fan-out nhiều use-case → 1 request = nhiều query |

Số lượng đã verify bằng `ls`: `get-combo-popularity.ts` có **4 file** (keno, lotto535, mega645,
power655) và `get-jackpot.ts` có **3 file** (lotto535, mega645, power655 — keno không có jackpot).

## Nhóm 3 — Polling endpoint (ngưỡng lỏng)

Mục đích ở đây **không** phải chống abuse mà **bảo vệ Mongo** khỏi poll storm. Bổ trợ cho micro-cache
của `docs/cache/04` Phase 2, không thay thế.

| Nhóm | Rule |
|---|---|
| `GET /games/{game}/draws/current` ×7 | `limit: 120, windowSec: 60, subject: "account"` |
| `GET /games/{game}/jackpot` — **3 game** (lotto535, mega645, power655) | `limit: 120, windowSec: 60, subject: "account"` |
| `GET /games/{game}/tickets`, `tickets/pending`, `tickets/{id}/entries`, `entries/{id}/lines` | `limit: 60, windowSec: 60, subject: "account"` |
| `GET /games/{game}/draw-results`, `draw-results/{drawId}` | `limit: 60, windowSec: 60, subject: "account"` |
| `GET /games/{game}/config` ×7 | `limit: 60, windowSec: 60, subject: "account"` |

Cảnh báo cụ thể: countdown client thường poll `draws/current` mỗi 1–3s → **20–60 req/phút là bình
thường**. Ngưỡng 120 chỉ chặn hành vi bất thường rõ rệt. Đặt thấp hơn là chặn người dùng thật.

## Cách làm

1. Thêm `rateLimit: { … }` vào options của handler — **không** đụng thân handler, không đụng use-case.
2. `route` đặt theo `"{game}.{action}"`, khai **tĩnh** tại chỗ (đọc được bằng mắt).
3. Viết test (Phần B) — xong test mới deploy staging.
4. **Load test staging** (B4) → hiệu chỉnh ngưỡng → deploy lại. Vòng lặp này rẻ vì chưa có user thật.

Một vòng A→B duy nhất cho toàn bộ danh sách. Không có giai đoạn nửa vời (một nửa endpoint có bảo vệ,
một nửa không) — đó là trạng thái không ai theo dõi được.

## Ngưỡng có nên gom 1 chỗ không?

**Không** gom vào file config tập trung. Khai tại handler vì:
- Đọc handler là biết ngay nó được bảo vệ thế nào (cùng tinh thần `require-static-classes`).
- File config tập trung tạo indirection: sửa ngưỡng ở file A ảnh hưởng endpoint ở file B mà review
  không thấy.

Nhưng **hằng số chia sẻ** đặt trong `apps/api-player/src/lib/` là hợp lý khi ≥3 endpoint dùng đúng
cùng một bộ số — tránh 20 chỗ ghi `limit: 120` rồi lệch nhau.

- Nhóm 3: ≥3 endpoint cùng bộ số → hằng chia sẻ (`POLLING_RATE_LIMIT` và anh em), không phải tùy ý.
- Nhóm 1 `place-bet`: **bắt buộc** một hằng `PLACE_BET_RATE_LIMIT` cho cả 7 game (cùng route
  `"player.place-bet"`). Đây là ngoại lệ có chủ đích của quy tắc "route duy nhất" — xem B1 #1.

---

# PHẦN B — TEST (viết SAU khi khai báo xong)

> Plan này **không viết logic mới** — chỉ thêm khai báo. Nên test ở đây trả lời đúng 2 câu:
> *"khai báo có đúng chỗ, đúng số không?"* và *"có endpoint nào bị bỏ sót / bật sai không?"*.
> Logic rate limit đã test ở `p0-01`; middleware đã test ở `p1-01` — **không lặp lại** ở đây.

## B1 — Unit test: khai báo là dữ liệu, kiểm được tĩnh

`apps/api-player/test/unit/rate-limit-config.test.ts`

Import options của từng handler rồi assert — không cần Redis, không cần gọi handler.

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 1 | Mọi `route` là **duy nhất**, **trừ** 7 handler `place-bet` cùng `"player.place-bet"` | Gom route; `Set` bằng số route sau khi gộp 7 `place-bet` thành 1. Assert cả 7 đều là đúng chuỗi đó | Trùng route ngoài nhóm này = chung quota, chặn oan. Riêng `place-bet` **phải** trùng — tách theo game cho tool bắn 7 game song song |
| 2 | `route` đúng format `"{game}.{action}"` | Regex `/^[a-z0-9]+\.[a-z-]+$/` | Sai format phá quy ước debug |
| 3 | `subject` dùng `GuardSubjectType`, **không** string literal | Đối chiếu với `Object.values(GuardSubjectType)` | `code-quality-standards.mdc` §5.3 |
| 4 | `limit` > 0, `windowSec` > 0, `burst` >= 0 | Vòng lặp mọi khai báo | `limit: 0` = chặn 100% → **outage tức thì** vì `enforce` là mặc định |
| 5 | Endpoint `place-bet` **không** dùng `subject: "ip"` | — | Mobile NAT/CGNAT: hàng nghìn player chung IP → chặn oan hàng loạt |
| 6 | Nhịp polling (req/phút = `limit / windowSec * 60`) **cao hơn** nhịp `place-bet` (12/phút) | So cặp cụ thể, **không** so field `limit` trần (`1` của cửa sổ 5 giây sẽ "thua" `120` một cách vô nghĩa) | Ngưỡng ngược nhau là lỗi copy-paste điển hình |
| 7 | Số endpoint bật rate limit **khớp** danh sách 3 nhóm trong plan | `toBe(<số>)` | Chống bật thừa (endpoint không có trong plan) và bật thiếu |
| 8 | **Mọi** endpoint mutation (`POST`/`PUT`/`DELETE`) của app đều có `rateLimit` | Liệt kê handler từ `functions/*.yml`, assert không sót | Sót 1 mutation = lỗ. Không còn đợt/shadow để "làm sau" nên phải đủ ngay |
| 9 | Nhóm 3 **và** 7 `place-bet` dùng **hằng chia sẻ** từ `src/lib/`, không literal rải rác | So reference, không so giá trị. `place-bet` phải là cùng một object `PLACE_BET_RATE_LIMIT` | Sửa hằng phải lan tới mọi endpoint; literal rải rác sẽ lệch — với cược thì lệch = một game lỏng hơn 5 giây |

## B2 — Integration test (Redis 8.6 thật)

Chỉ cần **1 endpoint tiêu biểu mỗi nhóm** — không nhân 3 lần cùng một kịch bản.

| # | Test | Cách xác nhận PASS | Vì sao tồn tại |
|---|---|---|---|
| 10 | `place-bet`: request thứ 2 **trước 5 giây** → **429**; sau ≥5 giây → 200 | `statusCode === 429` rồi 200. Cùng account, **khác game** (vd keno rồi mega645) vẫn 429 | Xác nhận spacing 5 giây và quota **chung** 7 game, không chỉ config đẹp |
| 11 | Cùng endpoint, dưới ngưỡng → **200** suốt | Gọi n lần | Không chặn oan |
| 12 | 2 account khác nhau → quota độc lập | A 429, B 200 | Cô lập theo subject ở endpoint thật |
| 13 | Nhóm 2 + Nhóm 3: vượt ngưỡng → 429 | 1 endpoint mỗi nhóm | Mỗi nhóm xác nhận 1 lần |
| 14 | Redis chết → endpoint **vẫn 200** | — | Fail-open ở endpoint thật, không chỉ handler giả |
| 15 | `place-bet` bị 429 → **không** vé nào được tạo cho request đó | `countDocuments === <số request đã pass>` | Rate limit phải đứng **trước** use-case. Vé vẫn tạo = middleware đặt sai chỗ. **Đường tiền — không bỏ test này** |

## B3 — Không regress

| # | Lệnh | Kỳ vọng |
|---|---|---|
| 16 | `pnpm --filter @megawin/api-player test` | Xanh toàn bộ |
| 17 | `pnpm --filter @megawin/api-player check-types` | Xanh |
| 18 | `oxlint apps/api-player` | Không error |
| 19 | `git diff --stat` trên `apps/api-player/src` | **Chỉ** thay đổi ở options của handler + `src/lib/` (hằng chia sẻ). Thân handler và use-case **0 dòng thay đổi** |
| 20 | `rg -ni "shadow" apps/api-player` | **Không kết quả** — mode shadow không tồn tại |

## B4 — Xác nhận thủ công: load test staging (phần quan trọng nhất của plan này)

Không có traffic production để đối chiếu → **phải tự sinh traffic** trên staging. Đây là thứ thay thế
cho "đọc log shadow 7 ngày" của phương án cũ, và nó chặt hơn vì kiểm soát được biến số.

1. **Load test từng nhóm** bằng script bắn request mô phỏng client thật — mô phỏng **đúng nhịp** client
   dự kiến, không bắn max tốc độ. Ghi bảng: endpoint | nhịp mô phỏng | ngưỡng đặt | có 429 không.
   **429 ở nhịp bình thường của nhóm 2/3 = ngưỡng sai**, sửa ngưỡng chứ không kết luận "client sai".
   Riêng `place-bet`: nhịp người (chọn số + tiền, ≥5 giây) **không** được 429; script <5 giây
   **phải** 429. Không nới ngưỡng để script đi qua.
2. **Riêng endpoint polling**: chạy countdown client **thật** (không script) poll `draws/current` mỗi
   1s trong ≥5 phút → xác nhận **không** chạm ngưỡng 120. Ghi số request thực tế đã gửi.
3. **Riêng `refresh-token`**: mô phỏng **nhiều player chung 1 IP** (đúng ca CGNAT) → xác nhận
   `limit: 10, subject: "ip"` có chịu được không. Đây là ca dễ sai nhất của cả plan. Không chịu được →
   nâng ngưỡng, hoặc đổi `subject` nếu endpoint có identity sau auth.
4. **Xác nhận `Retry-After` dùng được**: client thật nhận 429 → chờ đúng số giây trong header → gọi lại
   thành công. Ghi giá trị header quan sát được.
5. **Xác nhận van tắt**: set `GUARD_RATELIMIT_MODE=off` trên staging → vượt ngưỡng vẫn 200. Ghi lại.

## Definition of done

**Phần A (khai báo):**

- [ ] Cả 3 nhóm đã thêm `rateLimit` đúng endpoint trong danh sách, chạy `enforce` (mặc định toàn cục).
- [ ] 7 `place-bet` dùng chung `PLACE_BET_RATE_LIMIT`: `route: "player.place-bet"`, `limit: 1`,
      `windowSec: 5`, `burst: 0`, `subject: "account"`.
- [ ] Không handler nào bị sửa phần thân/use-case — chỉ thêm khai báo options.
- [ ] Nhóm 3 dùng hằng chia sẻ ở `apps/api-player/src/lib/`, không rải 20 chỗ.
- [ ] Không endpoint mutation nào bị sót (B1 #8).
- [ ] `check-types` + `oxlint` + `prettier` xanh.

**Phần B (test):**

- [ ] 9 unit test (B1) xanh — đặc biệt **#1 (route duy nhất, trừ 7 `place-bet` chung)**,
      **#7 (số endpoint khớp plan)**, **#8 (không sót mutation)**.
- [ ] Integration **#10**: request thứ 2 trước 5 giây → 429, kể cả khi đổi game.
- [ ] 6 integration test (B2) xanh, phủ cả 3 nhóm + fail-open #14 + **#15 (429 → không tạo vé)**.
- [ ] B3 #19 xác nhận diff **chỉ** ở options/lib; #20 xác nhận không còn `shadow`.
- [ ] B4 #1: **đã ghi bảng load test** cho từng nhóm (không giữ số suy đoán chưa kiểm).
- [ ] B4 #2: đã test countdown client **thật** không chạm ngưỡng polling, có số request ghi lại.
- [ ] B4 #3: đã test ca **CGNAT nhiều player 1 IP** cho `refresh-token`, có kết luận giữ/nâng/đổi subject.
- [ ] B4 #4–5: đã xác nhận `Retry-After` dùng được và van tắt `off` hoạt động trên staging.
- [ ] Mọi `A-fix` (sửa ngưỡng sau load test) đã ghi lại kèm lý do.

## Không làm trong plan này

- ❌ **Shadow mode / chia 3 đợt** — đã loại khỏi scope (xem đầu plan).
- ❌ `api-tenant` → `p1-03`.
- ❌ Metrics/dashboard/alert → `p2-01`.
- ❌ Sửa micro-cache/TTL của `docs/cache` Phase 2 — độc lập, đừng trộn.