# p1-04 — Port toàn bộ Ops Hub sang Bingo18

> **Phase:** P1 · **Status:** ⏳ pending · **Phụ thuộc:** p1-03 (Keno phải xong & chạy ổn) · **Chặn:** P2
> **Scope:** `game-bingo18` + `game-bingo18-application` + `apps/backoffice/.../bingo18/operations-hub/`
> **Điều kiện bắt đầu:** Keno Hub chạy production ổn định ≥ **1 tuần**

## 0. Bản này khác bản trước ở đâu

| Bản trước | Bản này | Vì sao |
|---|---|---|
| *"Số kỳ/ngày Bingo18: **cần đo**"* | **158**, đã verify trong code | Con số + cách suy ra nằm sẵn ở `financials.ts:132-133`. "Cần đo" là chưa đọc code |
| Không nhắc `salesCloseBeforeSeconds` | **30 (Keno 60)** — §2.1, xếp rủi ro 🔴 | Đây là số dễ copy sai nhất và sai thì **im lặng** |
| Không nhắc `drawIntervalMinutes` | **6 (Keno 8)** | Ảnh hưởng nhịp state |
| *"`VOIDABLE_STATUSES` của Bingo18 **có thể khác**"* | Đã verify **giống hệt** — vẫn phải đọc lại | Bỏ được 1 ẩn số |
| Port 2 bulk action (settle, void) | Port **4** (thêm close-sales, open-sales) | p0-04 viết lại thêm 2 |
| Bước 15: *"Detail Sheet (import `DrawCommandCenter`)"* | Inline expand + **dùng lại** `drawOperationsHref` | p1-03 bỏ Sheet |
| Không có bước index | **§3.4 riêng** cho `idx_hub_row_covering` + bắt buộc dán `explain` | Thiếu index = 5MB read/poll mà vẫn "chạy đúng" |
| Không nhắc cache route | Bước 7 kèm cache TTL 2s | p1-01 §11 thêm |
| Không nhắc `DEFAULT_HUB_LIMIT` | §2.2: **giữ 300**, không giảm về 158 | Kỳ tồn đọng ngày trước |
| 4 câu hỏi mở | **6** câu (§1) | Plan viết lại sinh thêm ẩn số cần production xác nhận |
| Không có mục verify p0-01/p0-02 | **§5** | Hai plan đó đã bao trùm Bingo18 — verify, không làm lại |

## 1. Vì sao port SAU, không làm song song

Làm 2 game song song nghe nhanh hơn, nhưng mọi quyết định thiết kế **chưa được production xác nhận** sẽ
phải sửa **2 lần**. Các điểm còn để mở sau khi viết lại toàn bộ plan P0/P1:

| Câu hỏi mở | Ở plan | Chỉ trả lời được bằng production |
|---|---|---|
| Covering index `idx_hub_row_covering` có thật sự cho `totalDocsExamined = 0`? | p0-03 §4 (amend p1-01) | Cần `explain()` trên dữ liệu thật, kích cỡ thật |
| Cache module-level TTL 2s có đủ (bao nhiêu staff trực đồng thời)? | p1-01 §11 | Đo hit-rate thật |
| `exposureRaw` (chưa cap) có gây hiểu nhầm cho staff? | p0-03 §6.3 | Phản hồi người trực |
| Boundary scheduling có đủ mượt sau 8 tiếng mở liên tục? | p1-01 §5.3 | Chỉ lộ khi trực cả ca |
| Bảng 5B có cần virtualization ở 158 dòng? | p1-02 §2.2 | Bingo18 **nhiều hơn** Keno 33% → xem §2 |
| `BULK_MAX_DRAWS = 50` / `BULK_CONCURRENCY = 5` có đúng? | p0-04 §2.2 | Đo p95 khi settle lô thật |

Sáu câu này chốt xong mới port. Port trước = rework nhân đôi.

**Ngoại lệ duy nhất được làm sớm:** p0-01 và p0-02 **đã bao trùm cả Bingo18** ngay từ đầu (p0-01 sửa
`game-core` dùng chung 7 game; p0-02 bỏ guard cho **cả hai** game). Nên p1-04 **không** phải làm lại
phần đó — chỉ verify.

## 2. Khác biệt Bingo18 vs Keno — đã verify trong code, KHÔNG cần đo lại

Bảng dưới lấy trực tiếp từ [`packages/game-bingo18/src/rules/financials.ts:125-136`](../../../packages/game-bingo18/src/rules/financials.ts)
và [`packages/game-keno/src/rules/financials.ts:228-236`](../../../packages/game-keno/src/rules/financials.ts):

| Mặt | Keno | Bingo18 | Ảnh hưởng Hub |
|---|---|---|---|
| `drawIntervalMinutes` | 8 | **6** | Nhịp kỳ chuyển sang `Ended` nhanh hơn 1.33× |
| `firstDrawTime` → `lastDrawTime` | 06:08 → 21:52 | **06:06 → 21:53** | — |
| **Số kỳ/ngày** | **119** | **158** (+33%) | `DEFAULT_HUB_LIMIT`, ngưỡng test perf, bảng 5B |
| `salesCloseBeforeSeconds` | 60 | **30** | Cửa sổ `PendingOpen` hẹp hơn — xem §2.1 |
| `VOIDABLE_STATUSES` | `{Scheduled, SalesClosed, Published}` | **giống hệt** | Không cần sửa logic void |
| Theme màu | orange | **green** | `GAME_COLORS[GameProduct.Bingo18]` |
| Number pool | 01–80 | 3 xúc xắc 1–6 | **Không ảnh hưởng Hub** (Hub không có heatmap) |
| Play types | 10 pick + 2 side bet | play type + triple + big/small | Không ảnh hưởng Hub (Hub không tách exposure theo playType) |
| Jackpot | Không | Không | Lý luận an toàn p0-02 áp dụng y nguyên |

**Bản p1-04 cũ ghi "số kỳ/ngày Bingo18: cần đo" — sai.** Con số đã có trong comment code, kèm giải
thích cách suy ra từ dữ liệu Vietlott thật: `floor((21:53 − 06:06) / 6) + 1 = 158`. Không cần đo, chỉ
cần **đọc**. (Vẫn nên verify 1 lần bằng `countDocuments` để chắc worker sinh đủ kỳ — nhưng đó là verify
worker, không phải "đo để biết con số".)

### 2.1 `salesCloseBeforeSeconds = 30` — điểm dễ sai nhất khi port

Bingo18 đóng bán chỉ **30 giây** trước giờ quay (Keno: 60 giây). Trong khi
[`MIN_SALES_WINDOW_SECONDS = 60`](../../../packages/game-core/src/utils/draw-schedule.ts) là hằng số
**dùng chung** cho mọi game.

Hệ quả cụ thể lên `deriveDrawState`: kỳ `PendingOpen` (Scheduled, `now < closeAt`) của Bingo18 rơi vào
vùng "mở bán không còn ý nghĩa" **sớm hơn tương đối** so với thời điểm quay, vì `closeAt` gần `drawTime`
hơn nhưng ngưỡng cửa sổ tối thiểu không đổi.

**Xử lý:** `deriveDrawState` **đã** nhận `salesCloseBeforeSeconds` từ DTO snapshot (p0-03 §6.2) —
không hardcode. Nên phần này **tự đúng**, miễn là:

- [ ] Route Bingo18 trả `salesCloseBeforeSeconds` **của Bingo18** (đọc từ config Bingo18, không copy 60).
- [ ] Test `PendingOpen` health cho Bingo18 với `salesCloseBeforeSeconds = 30`, **không** tái dùng số
      liệu test của Keno.

Đây là ví dụ điển hình của lỗi copy-paste im lặng: dùng 60 cho Bingo18 thì badge health vẫn hiện, vẫn
"trông đúng", chỉ sai ngưỡng ~30 giây — không ai phát hiện khi review.

### 2.2 158 kỳ — ảnh hưởng thật lên UI

| Chỗ | Keno (119) | Bingo18 (158) | Cần làm |
|---|---|---|---|
| Bảng 5A (`Ended`/`PendingOpen`/`Halted`) | vài → vài chục dòng | tương tự (chỉ nhiều hơn nhịp 1.33×) | Không đổi |
| Bảng 5B (`Open`) — Lớp 3 bung full | ~110 dòng | **~150 dòng** | Ngưỡng cân nhắc virtualization (p1-02 §2.2) tới đây mới sát |
| Day Flow Stepper | 119 ô | **158 ô** | Verify không tràn / không co ô quá nhỏ ở 1280px |
| `DEFAULT_HUB_LIMIT` | phải ≥ 119 | phải ≥ **158** | Xem §3.1 |
| Payload snapshot | N=119 | N=158 (+33% bytes) | Verify ETag/304 vẫn hiệu quả |

**`DEFAULT_HUB_LIMIT` không được đặt bằng con số kỳ/ngày.** Kỳ chưa xong có thể **tràn sang ngày trước**
(kỳ hôm qua chưa settle). Đặt limit = 158 sẽ **âm thầm cắt** đúng những kỳ tồn đọng — thứ mà Hub tồn tại
để hiển thị. p0-03 đã chốt `DEFAULT_HUB_LIMIT = 300` **chính vì Bingo18 158 kỳ** (≈ 2 ngày backlog), kèm
cờ `truncated` + banner (p1-01 §7). Port **giữ nguyên 300**, không "tối ưu" xuống.

## 3. Danh sách port — theo thứ tự, cập nhật theo plan mới

### 3.1 Backend — mirror p0-03

| # | File Bingo18 | Nguồn | Ghi chú |
|---|---|---|---|
| 1 | `game-bingo18-application/src/infras/repos/draw-repo.ts` — thêm `listUnfinishedDrawRows` + `getCloseAtByDrawIds` | Keno cùng tên | Projection dùng `docPath<Bingo18DrawDoc>()`, field `sales.closeAt` / `sales.openAt` (p0-03 §3) |
| 2 | `infras/repos/betting-stats-repo.ts` — thêm `getRowsByDrawIds` | Keno cùng tên | **Thin projection** bắt buộc (p0-03 §6.3) |
| 3 | `infras/repos/ops-alert-repo.ts` — thêm `countByDrawIds` | Keno cùng tên | Aggregation `$group`, không N query |
| 4 | `use-cases/operations/dto/hub-snapshot.dto.ts` | Keno cùng tên | RAW + `serverNow` + `salesCloseBeforeSeconds` **= 30** |
| 5 | `use-cases/operations/get-ops-hub-snapshot.ts` | Keno cùng tên | 2 tầng `Promise.all`, 4 query cố định |
| 6 | `packages/game-bingo18/src/indexes/index.ts` — **`idx_hub_row_covering`** | p0-03 §4 (amend ở p1-01 §11) | Xem §3.4 — **bước dễ bỏ sót nhất** |
| 7 | Route `apps/backoffice/.../bingo18/operations/hub-snapshot/route.ts` | Keno cùng tên | Kèm **module-level cache TTL 2s** (p1-01 §11) |

**Không** dùng generic/base class để "chia sẻ" giữa 2 game. Repo có 7 game với 7 bộ use-case song song —
đó là pattern chủ đạo (`gitnexus-code-graph.mdc` §2: mọi tên use-case trùng 7 lần). Tạo abstraction cho 2
game làm 5 game còn lại thành ngoại lệ.

**DTO `OpsHubDrawRow`:** sau khi viết lại p0-03, DTO này chỉ chứa field **tài chính + thời gian chung**,
không có gì đặc thù game (exposure theo playType đã bị loại khỏi hub). Nên **có thể** đặt ở
`game-core/types`. Nhưng: quyết định **lúc port**, sau khi đối chiếu field-by-field. Nếu Bingo18 cần dù
chỉ 1 field riêng → giữ riêng mỗi game.

### 3.2 Backend — mirror p0-04

| # | File | Ghi chú |
|---|---|---|
| 8 | `use-cases/draws/bulk-trigger-settle.ts` | Dùng lại `runBulkDrawAction` |
| 9 | `use-cases/draws/bulk-void-draw.ts` | `VOIDABLE_STATUSES` đọc từ `void-draw.ts` **của Bingo18** |
| 10 | `use-cases/draws/bulk-close-sales.ts` | Mới ở bản p0-04 viết lại |
| 11 | `use-cases/draws/bulk-open-sales.ts` | Mới. Cần `getCloseAtByDrawIds` (bước 1) để lọc kỳ đã quá `closeAt` |
| 12 | `bulk-limits.ts` | `BULK_MAX_DRAWS` / `BULK_CONCURRENCY` — **giá trị đã chốt ở Keno production** |
| 13 | 4 route `bulk-settle` / `bulk-void` / `bulk-close-sales` / `bulk-open-sales` + `_lib/schema.ts` | Cả 4 trả **200** kèm `results` (p0-04 §4) |

**Đã verify:** `VOIDABLE_STATUSES` của Bingo18
([`void-draw.ts:14`](../../../packages/game-bingo18-application/src/use-cases/draws/void-draw.ts))
**giống hệt** Keno: `{Scheduled, SalesClosed, Published}`. Vẫn phải **đọc lại lúc port** — nếu ai đó sửa
1 trong 2 file giữa lúc này và lúc port, copy giá trị từ plan này thành lỗi.

Kéo theo: `SalesOpen` **không** voidable ở Bingo18 → ràng buộc "phải đóng bán trước khi void kỳ
`PendingClose`" (p0-04 §3, p1-02 §8.1) áp dụng **y nguyên**.

### 3.3 Frontend — mirror p1-01 → p1-03

| # | Nội dung | Ghi chú |
|---|---|---|
| 14 | Entry `nav-registry.ts` cho `bingo18-operations-hub` | Thêm vào `NavPage` + registry, có `intent` |
| 15 | `bingo18Keys.opsHub()` trong `src/lib/query-keys/bingo18.ts` | **Khác** key Keno — nếu trùng, cache lẫn nhau |
| 16 | `operations-hub/page.tsx` + `_lib/use-hub-context.tsx` + `_lib/use-hub-query.ts` | `refetchOnWindowFocus: true` + `staleTime = pollSeconds` (p1-01 §4) |
| 17 | `_lib/derive-draw-state.ts` | Nhận `salesCloseBeforeSeconds` từ DTO — **không** hardcode (§2.1) |
| 18 | `_lib/use-boundary-tick.ts` | Boundary scheduling (p1-01 §5.3) |
| 19 | Zone 2 (hai khối) + Zone 3 (Overview + Stepper) + Zone 4 (banner) | Theme **green** |
| 20 | Zone 5A + 5B + selection + nuqs filter/sort | 5B ~150 dòng — xem §2.2 |
| 21 | Bulk Action Bar (4 action) | |
| 22 | Inline expand + `drawOperationsHref("bingo18", drawId)` | **Dùng lại hàm** của p1-03, không viết bản thứ hai (p1-03 §10) |

### 3.4 Bước 6 (index) — đừng bỏ sót

`idx_hub_row_covering` là thứ khiến `getRowsByDrawIds` thành covered query
(`totalDocsExamined = 0`) — với Bingo18 là **158 doc × ~33KB ≈ 5MB** mỗi lần poll nếu thiếu index.

Đây là bước dễ bỏ sót nhất vì: **Hub Bingo18 vẫn chạy đúng mà không có index.** Chỉ chậm. Và chậm 10s
mỗi lần poll trên staging ít dữ liệu thì không lộ ra.

- [ ] Index có trong `packages/game-bingo18/src/indexes/index.ts`, đã chạy migration.
- [ ] `explain("executionStats")` trên `getRowsByDrawIds` Bingo18 cho `totalDocsExamined = 0`.
- [ ] Dán output `explain` vào PR. **Không** chấp nhận "đã thêm index" mà không có `explain`.

## 4. Cái KHÔNG được làm khi port

1. **Không copy-paste rồi find-replace `keno` → `bingo18`.** `gitnexus-code-graph.mdc` §4 cấm rename bằng
   find-replace. Rủi ro cụ thể ở đây: sót 1 chỗ `keno` trong **string literal** (collection name, query
   key, endpoint path) → Hub Bingo18 đọc data Keno. Lỗi **im lặng và nghiêm trọng**: trang hiện số, số
   trông hợp lý, chỉ là của game khác.

   Cách đúng: mở file Keno, **viết lại** file Bingo18 theo nó, đọc từng dòng. Chậm hơn, nhưng find-replace
   không bắt được `salesCloseBeforeSeconds: 60` (§2.1) — đó không phải chữ "keno".

2. **Không tạo base class / generic chia sẻ 2 game** (§3.1). Ngoại lệ duy nhất đã chốt:
   `drawOperationsHref` (hàm thuần dựng URL, p1-03 §10).

3. **Không đổi code Keno** trong PR này. Phát hiện bug Keno khi port → PR riêng.

4. **Không bỏ test vì "đã test ở Keno".** Bingo18 có collection riêng, index riêng, config riêng
   (`intervalMinutes = 6`, `salesCloseBeforeSeconds = 30`).

5. **Không giảm `DEFAULT_HUB_LIMIT`** dù 158 < 300 (§2.2).

6. **Không copy giá trị số từ plan này** (`VOIDABLE_STATUSES`, 158, 30) — đọc lại từ code lúc port.

## 5. Verify p0-01 / p0-02 cho Bingo18 — chỉ verify, không làm lại

p0-01 và p0-02 **đã** bao trùm Bingo18 ngay từ khi làm Keno:

- **p0-01** sửa `game-core` (`SystemSettleGameDaily.version`, CAS `$eq`/`$inc`, `rollupVersion`) — dùng
  chung **7 game**. Bingo18 hưởng lợi tự động.
- **p0-02** bỏ guard tuần tự cho **cả Keno và Bingo18** trong cùng plan (Bingo18 cũng không có jackpot).

p1-04 chỉ cần verify:

- [ ] `SystemPublishSettleDailyUseCase` chạy với `gameProduct = bingo18` → CAS đúng, retry đúng.
- [ ] Settle song song 5 kỳ Bingo18 → rollup daily **không** mất doanh thu kỳ nào (đây là bug p0-01 fix).
- [ ] Settle Bingo18 **không** ghi lẫn vào doc daily của Keno (`gameProduct` đúng).
- [ ] `trigger-settle.ts` / `void-draw.ts` Bingo18 **không còn** `findUnfinishedDrawBefore` trong nhánh
      guard (p0-02 chỉ giữ nó cho KPI).

## 6. Test — chạy lại TOÀN BỘ, không smoke test

- [ ] p0-03: unit use-case + **`explain` covering index** (§3.4) + performance **158 kỳ** + ETag/304
- [ ] p0-04: unit 4 bulk action + integration staging (gồm `open-sales` lọc kỳ quá `closeAt`)
- [ ] p1-01: derive state + clock offset + boundary tick + Zone 2/3/4 + layout shift
- [ ] p1-02: selection (nhóm quan trọng nhất) + `partitionByAction` + 2 bảng + Focus Rail + perf
- [ ] p1-03: inline expand **0 request** + `prefetch={false}` + link `?drawId=`

### 6.1 Test riêng Bingo18 — không có ở Keno

| Case | Kỳ vọng |
|---|---|
| `countDocuments` kỳ 1 ngày Bingo18 | **158** (verify worker sinh đủ, không phải "đo để biết") |
| Snapshot Bingo18 trả `salesCloseBeforeSeconds` | **30**, không phải 60 |
| Snapshot Bingo18 trả `drawIntervalMinutes` | **6**, không phải 8 |
| `PendingOpen` health với `salesCloseBeforeSeconds = 30` | Ngưỡng tính theo 30, không tái dùng số liệu Keno (§2.1) |
| Query Hub Bingo18 | **Chỉ** kỳ Bingo18. Verify `drawId` prefix + collection name |
| `bingo18Keys.opsHub()` vs `kenoKeys.opsHub()` | **Khác nhau** — mở 2 tab 2 game, data không lẫn |
| Bulk settle Bingo18 | **Không** tác động kỳ Keno |
| Rollup daily sau settle Bingo18 | `gameProduct = bingo18`, không ghi lẫn |
| Theme | Green (`GAME_COLORS[GameProduct.Bingo18]`), không orange |
| Day Flow Stepper 158 ô @1280px | Không tràn, ô không nhỏ hơn ngưỡng bấm được |
| Bảng 5B bung full ~150 dòng | Đo lại quyết định virtualization (p1-02 §6.3) |
| Payload snapshot N=158 | Ghi số bytes vào PR, so với Keno N=119 |
| `drawOperationsHref("bingo18", drawId)` | Ra `/games/bingo18/operations?drawId=…` |

Nhóm "không lẫn data" là loại lỗi **chỉ** copy-paste tạo ra — bắt buộc test, không giả định.

## 7. Review checklist

- [ ] `rg -in 'keno' apps/backoffice/src/app/\(main\)/games/bingo18 packages/game-bingo18 packages/game-bingo18-application`
      → **0 match** (trừ comment tham chiếu plan).
- [ ] `bingo18Keys.opsHub` khai trong `src/lib/query-keys/bingo18.ts`, **không** trong `_lib/`.
- [ ] Collection name dùng `Bingo18Collections.*`, không literal.
- [ ] `VOIDABLE_STATUSES` **đọc từ** `void-draw.ts` của Bingo18 (đã verify giống Keno, vẫn phải đọc).
- [ ] `salesCloseBeforeSeconds` / `drawIntervalMinutes` lấy từ **config Bingo18**, không hardcode, không
      copy 60/8 của Keno.
- [ ] `DEFAULT_HUB_LIMIT = 300` giữ nguyên.
- [ ] `idx_hub_row_covering` đã thêm + có `explain` dán vào PR (§3.4).
- [ ] Cache module-level TTL 2s có trong route Bingo18.
- [ ] Theme green qua `GAME_COLORS`, không hardcode hex.
- [ ] Dùng lại `drawOperationsHref`, **không** viết bản Bingo18 riêng.
- [ ] **Không** base class/generic chia sẻ 2 game (ngoài ngoại lệ đã chốt).
- [ ] **Không** file nào của Keno bị sửa. `git diff --stat` xác nhận.
- [ ] Đã chạy **toàn bộ** test §6, không skip.
- [ ] 6 câu hỏi mở của Keno (§1) đã chốt, kết luận áp dụng đúng cho Bingo18.
- [ ] `pnpm check-types` + `pnpm lint` xanh.
- [ ] Trang `/games/bingo18/operations` (1 kỳ) **không** regress.

## 8. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| **Sót `keno` trong string literal → Hub Bingo18 đọc data Keno** | 🔴 | Viết lại thay vì find-replace + grep checklist + test §6.1 |
| Bulk Bingo18 tác động kỳ Keno | 🔴 | Test §6.1 + verify rollup |
| **`salesCloseBeforeSeconds` copy 60 của Keno** → ngưỡng health sai ~30s, im lặng | 🔴 | §2.1 + test riêng |
| Bỏ sót `idx_hub_row_covering` → 5MB read/poll, chỉ "chậm" nên không lộ | 🔴 | §3.4 yêu cầu `explain` dán PR |
| `drawIntervalMinutes` copy 8 → nhịp state lệch | 🟡 | Test §6.1 |
| Query key trùng Keno → cache lẫn | 🟡 | Checklist + test 2 tab |
| Giảm `DEFAULT_HUB_LIMIT` xuống ~158 vì "chỉ có 158 kỳ" | 🟡 | §2.2 giải thích kỳ tồn đọng ngày trước |
| Port trước khi Keno ổn → rework 2 lần | 🟡 | Điều kiện §1: production ≥ 1 tuần + 6 câu hỏi chốt |
| Tạo abstraction sớm cho 2 game | 🟡 | Cấm §4.2, review bắt buộc |
| Stepper 158 ô tràn / ô quá nhỏ | 🟢 | Test §6.1 @1280px |

## 9. Rollback

Revert commit. Hub Keno **không** ảnh hưởng — PR này không sửa file Keno (checklist §7 bắt buộc điều đó).
`idx_hub_row_covering` của Bingo18 `dropIndex` an toàn (index chỉ phục vụ query mới).

Lưu ý: **không** revert p0-01/p0-02 — hai plan đó đã ở production cho cả 7 game trước khi p1-04 bắt đầu,
và revert chúng sẽ mở lại race condition rollup daily.

