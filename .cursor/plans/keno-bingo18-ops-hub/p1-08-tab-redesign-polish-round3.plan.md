# P1-08 — Tab Redesign + Polish Round 3

> **Nguồn:** review UI thật của bạn sau khi dùng bản p1-07 (08/09/2026), 8 điểm — đã verify lại
> bằng CDP (đo px thật) + đọc code (không đoán). Plan này **CHƯA CODE** — cần bạn chốt các câu hỏi
> ở §9 trước khi implement, theo đúng quy trình đã làm ở p1-05/p1-07.
>
> Liên quan: [`p1-07-ui-polish-round2`](./p1-07-ui-polish-round2.plan.md) (đã done),
> [`00-overview.md`](./00-overview.md).

## 0. Danh sách 8 điểm feedback (nguyên văn, đánh số lại để tham chiếu)

1. Dải kỳ (Timeline Rail): kỳ hiện tại mất viền trên. Đề xuất kéo chuột/slide thay Next/Back.
2. Checkbox header lệch hàng với checkbox từng dòng trong bảng.
3. Lên plan P1-06 (nhập kết quả liên tục) — **tách riêng, không nằm trong file này** (xem §8).
4. KPI quá thưa — cần thêm số liệu hữu ích.
5. Chiều cao màn hình còn dài, cuộn chưa tốt.
6. "Live" + chấm radio nên chuyển xuống dưới subtitle "127 kỳ đang theo dõi...".
7. Icon khoá (Lock) giải thích sai — kỳ đó cần nhập kết quả, không phải "đã xử lý xong".
8. Bỏ tab "Cần xử lý" — mỗi tab nên ứng đúng 1 trạng thái/action, tránh trộn lẫn khi bulk.

---

## 1. Chẩn đoán có bằng chứng (CDP + đọc code, 08/09/2026)

### 1.1 — Dải kỳ mất viền trên kỳ hiện tại (điểm 1)

Đọc `hub-timeline-rail.tsx:140`: kỳ hiện tại (`isBoundary`) dùng
`ring-2 ring-primary ring-offset-2 ring-offset-background`. Card cha lại nằm trong
`<div ref={scrollRef} className="flex ... overflow-x-auto ... pb-1">` — **không có `pt`/`py` đủ
lớn phía trên** để chứa `ring-offset-2` (2px) + `ring` (2px) = 4px cần thêm phía trên card. Do
`overflow-x-auto` cắt theo hộp chứa, phần ring phía trên bị đúng hộp cha (không có padding-top)
cắt mất — khác với "hở góc" ở bug cũ (đã fix), đây là **viền trên bị chính viewport cha cắt**.
→ Chỉ cần thêm `pt-1` (hoặc `py-1`) cho container scroll để ring có chỗ vẽ đủ 4 phía.

Về Next/Back → kéo-thả: code ĐÃ CÓ drag-to-scroll (pointer events, `handlePointerDown/Move/Up`,
dòng 260-297) từ p1-05. Nút `Lùi`/`Tiến` (`ChevronLeft`/`ChevronRight`) là **bổ sung** cho
drag, không phải thay thế — chúng nhảy theo `span` cố định (không nhảy pixel), hữu ích cho
keyboard/không có chuột. Bạn nhận xét "cách dùng Next/Back không hay" — khả năng cao là do
lúc bạn test chưa nhận ra có thể **click-and-drag trực tiếp trên các card** (không có gợi ý thị
giác nào báo "kéo được"). Đề xuất: giữ cả 2 (drag đã có), nhưng bỏ cặp Lùi/Tiến (dư thừa khi đã
có drag mượt hơn) và thêm chỉ báo thị giác nhẹ (cursor `grab`/`grabbing` — ĐÃ có ở dòng 370,
nhưng chỉ đổi cursor khi hover, không đủ gợi ý). Xem quyết định ở §9 Q1.

### 1.2 — Checkbox header lệch hàng với checkbox dòng (điểm 2)

Đo CDP thật (đã lấy `getBoundingClientRect()`):
```
header checkbox: x=45, width=16   (left=45, right=61)
row checkbox:    x=33, width=16   (left=33, right=49)
```
Lệch chính xác **12px** sang trái. Đọc code:
- Header: `hub-queue-table.tsx:191` → `<TableHead className="w-8 pl-5">` (padding-left 20px,
  `w-8`=32px tổng, checkbox 16px căn theo `pl-5` = lệch phải 20px từ mép trái ô).
- Row: `queue-row.tsx:144` → `<TableCell className="w-8 py-2">` — **không có `pl-5`**, chỉ
  `TableCell` mặc định `p-2` (padding 8px đều 4 phía) → checkbox lệch phải chỉ 8px từ mép ô.

→ Bug thật: 1 bên `pl-5` (20px), 1 bên `p-2` (8px) → lệch 12px, đúng số đo CDP. Sửa: đồng bộ
padding-left giữa `TableHead` cột 1 và `TableCell` cột 1 — cả hai nên dùng cùng 1 class
(khuyến nghị bỏ `pl-5` ở header, dùng `pl-2` khớp `TableCell` mặc định `p-2`, đơn giản nhất).

### 1.3 — KPI quá thưa (điểm 4)

Hiện tại 3 card (Tổng tiền cược / Tổng số vé / Rủi ro chi trả), mỗi card 1 dòng `sub` breakdown
"tồn đọng". Đối chiếu với quyết định p1-07 §10: bạn đã chốt **bỏ 4 card đếm trùng tab bar**
để tránh 2 nơi hiện cùng 1 số. Feedback lần này ("quá thưa, thiếu số liệu hữu ích") mâu thuẫn
biểu hiện với quyết định trước — cần hỏi lại CHÍNH XÁC muốn thêm gì (không đoán, xem §9 Q3).

Ứng viên số liệu CHƯA hiện nhưng CÓ SẴN trong `DerivedRow`/snapshot (không cần query mới):
- `sets` (số bộ vé) — đang chỉ hiện ở bảng, không ở KPI.
- `largeBetCount` (số cược lớn toàn hệ thống) — hiện chỉ per-row.
- Doanh thu TB/kỳ đang bán (`selling.revenue / selling.count`).
- Số kỳ theo từng gate (Đang bán / Chờ đóng bán / Chờ KQ / Chờ kết sổ) — nhưng đây CHÍNH LÀ điều
  đã bỏ ở p1-07 vì trùng tab bar. Nếu muốn lại → phải chấp nhận trùng lặp có chủ đích (khác lúc
  trước "bỏ vì trùng"), cần bạn xác nhận rõ.

### 1.4 — Chiều cao màn hình dài (điểm 5)

Đo cấu trúc trang hiện tại (không tính scroll riêng của bảng `max-h-[70vh]`):
Header (~52px) + KPI (~88px với gap) + Timeline Rail (~140px) + Alert Banner (~40px/dòng) +
grid 2 cột (bảng 5A + 5B, MỖI THỨ có `max-h-[70vh]` riêng — đã giới hạn từ p1-07) + Bulk bar
(sticky, chỉ khi có selection). Tổng chiều cao form KHÔNG scroll riêng lẻ đã ~= 52+88+140+40+70vh
≈ 320px + 70vh. Với viewport 900px, 70vh=630px → tổng ≈ 950px, **vượt viewport 900px** → trang
vẫn phải cuộn NGOÀI (page scroll) VÀ cuộn TRONG bảng (bảng scroll riêng) — 2 lớp cuộn lồng nhau,
đúng là trải nghiệm "dài" bạn mô tả.

→ Nguyên nhân gốc: `max-h-[70vh]` tính theo % viewport nhưng KHÔNG trừ đi phần header/KPI/rail
đã chiếm phía trên nó → tổng luôn > 100vh khi cả 3 phần trên cộng lại > 30vh. Cách khắc phục
đúng: dùng CSS Grid/Flexbox toàn trang với `h-[calc(100vh-headerHeight)]` cho phần thân, hoặc
đơn giản hơn — bỏ page-level scroll, biến TOÀN BỘ page thành `h-screen flex flex-col`, cho bảng
`flex-1 overflow-y-auto` (chiếm hết phần còn lại, không dùng `vh` cố định). Xem đề xuất §9 Q4.

### 1.5 — "Live" indicator vị trí (điểm 6)

Đọc `hub-page-header.tsx:100-115`: `RefreshButton` (chứa Live/chấm) nằm ở khối bên PHẢI cùng
hàng với "Tạo kỳ quay", TÁCH XA subtitle "127 kỳ đang theo dõi..." (nằm bên TRÁI, dưới H1). Bạn
muốn Live/chấm chuyển xuống ngay dưới/cạnh subtitle bên trái — nghĩa là tách `RefreshButton` ra
khỏi cụm nút hành động bên phải, ghép cạnh dòng subtitle. Đây là thay đổi layout đơn giản (di
chuyển JSX), không có rủi ro kỹ thuật — chỉ cần xác nhận bố cục chính xác ở §9 Q5.

### 1.6 — Icon khoá giải thích sai (điểm 7)

Đọc `queue-row.tsx:151-158` — tooltip hiện tại: **"Đã xử lý xong — không còn hành động khả
dụng"**. Đây SAI theo `hasAnyAction()` (`partition-by-action.ts:63-68`): hàm này trả `false` khi
row KHÔNG thuộc {settlable, closable, openable} — tức là row có thể đang ở NHIỀU trạng thái khác
nhau, không chỉ "đã xử lý xong":
- `stage = AwaitingDraw` (chờ tới giờ quay — CHƯA có gì để làm, đúng)
- `stage = AwaitingResult` (đã đóng bán, CHỜ NHẬP KẾT QUẢ — đây là điều bạn chỉ ra: sai!)
- `stage = Settling`/`Voiding` (đang xử lý nền)
- Thực sự "đã xong" (Settled/Void)

→ Bug thật: tooltip generic 1 câu cho 5+ trạng thái khác nhau, và câu đó chỉ ĐÚNG cho 1/5
trường hợp. Cần tooltip ĐỘNG theo `row.stage` thực tế (tương tự cách `actionUnavailableReason`
đã làm cho action bulk). Xem sửa ở §6.

### 1.7 — Tab "Cần xử lý" trộn nhiều action (điểm 8)

Đọc `filter-sort-rows.ts:isNeedsAction()` — hợp bởi OR của 4 điều kiện ĐỘC LẬP:
`health≠ok` OR `stage∈{AwaitingSettle,NeedsResettle,NeverOpened}` OR
`gate∈{PendingOpen,Halted}` OR `alertsCritical>0`. Đúng như bạn quan sát: 1 dòng trong tab này
có thể cần **"Mở bán"** (PendingOpen) trong khi dòng khác cần **"Kết sổ lại"** (NeedsResettle)
— 2 action HOÀN TOÀN KHÁC NHAU cùng hiện trong 1 tab, cùng có checkbox. Nếu staff chọn TẤT CẢ
(checkbox header "Chọn tất cả") rồi bấm 1 nút bulk (VD "Kết sổ") — `partitionByAction` sẽ tự
lọc đúng theo action đó (chỉ áp cho `settlable`), nên về mặt AN TOÀN DỮ LIỆU **không có bug** (đã
verify code — `HubBulkActionBar` tính `drawIds` riêng cho mỗi nút, KHÔNG áp nhầm action lên dòng
không phù hợp). NHƯNG về UX đúng như bạn nói: dễ gây HIỂU LẦM "chọn tất cả rồi bấm 1 nút" sẽ xử
lý hết, khi thực ra 1 phần bị bỏ qua âm thầm (dòng vẫn được chọn nhưng nút hiển thị số ít hơn
tổng đã chọn — dễ bị bỏ qua vì con số nhỏ, VD "Kết sổ (3)" khi đã chọn 86 dòng).

→ Đề xuất: tách tab "Cần xử lý" theo action, xem giải pháp đầy đủ ở §7.

---

## 2. Fix nhanh, không tranh luận (làm luôn, không cần chờ §9)

| # | Fix | File | Chi tiết |
|---|---|---|---|
| 2a | Ring kỳ hiện tại mất viền trên | `hub-timeline-rail.tsx` | Container scroll (`ref={scrollRef}`) đổi `pb-1` → `py-1.5` (đủ chỗ cho `ring-offset-2`+`ring-2` = 4px mỗi phía, dư 2px an toàn) |
| 2b | Checkbox lệch hàng 12px | `hub-queue-table.tsx` + `queue-row.tsx` | Bỏ `pl-5` ở `TableHead` cột 1, đổi thành `pl-2` (khớp `p-2` mặc định của `TableCell`) — cả 2 cùng `className="w-8 pl-2"` (header) / `"w-8 py-2 pl-2"` (row, giữ `py-2` cũ) |
| 2c | Tooltip icon khoá sai nghĩa | `queue-row.tsx` | Đổi tooltip tĩnh → hàm `lockedReason(stageOrGateKey)` trả câu ĐÚNG theo stage thực tế (bảng ở §6) |

## 3. Timeline Rail — bỏ Lùi/Tiến hay giữ? (điểm 1, còn lại)

2 phương án (chọn ở §9 Q1):

**A. Giữ cả drag + Lùi/Tiến** (không đổi hành vi, chỉ fix viền §2a) — rủi ro thấp nhất, nhưng
không giải quyết cảm giác "Next/Back không hay" của bạn nếu nguyên nhân thực sự là bạn **không
biết** có thể kéo (thiếu gợi ý thị giác).

**B. Bỏ Lùi/Tiến, chỉ còn drag + "Về kỳ hiện tại"**, thêm gợi ý thị giác nhẹ: 2 vùng mờ dần
(gradient fade trái/phải, giống carousel) ở 2 mép dải kỳ khi còn có thể kéo tiếp — báo hiệu
"còn nội dung, kéo được" mà không cần nút bấm. `+`/`−` (thu/mở cửa sổ số kỳ hiển thị) vẫn giữ
(khác chức năng, không phải điều hướng).

## 4. KPI — cần bạn xác nhận muốn thêm loại số liệu nào (điểm 4)

Không tự thêm lại các card đã CHỦ ĐỘNG bỏ ở p1-07 (đếm theo tab) nếu không có xác nhận rõ, vì
sẽ lặp lại đúng vấn đề p1-07 đã sửa ("2 nơi hiện cùng 1 số"). Đưa ra 3 phương án cụ thể, mỗi
phương án tái dùng dữ liệu ĐÃ CÓ (0 query mới):

**Phương án A — Thêm 2 dòng phụ vào MỖI card tài chính hiện có** (không thêm card mới, "đặc"
hơn mà không thêm hộp): mỗi card 3 dòng thay 2 — `value` chính, dòng "đang bán/tồn đọng" (đã
có), thêm dòng thứ 3 riêng theo từng card:
- Tổng tiền cược → thêm "TB {x}/kỳ đang bán" (`selling.revenue / selling.count`).
- Tổng số vé → thêm "{sets} bộ vé".
- Rủi ro chi trả → thêm "{largeBetCount} cược lớn" (đếm toàn hệ thống, cạnh số cảnh báo).

**Phương án B — Thêm card thứ 4 "Đang bán"** (count + TB doanh thu/kỳ) — dữ liệu này hiện chỉ
nằm trong tiêu đề section 5B (`Đang bán · N kỳ`), phía dưới màn hình, chưa có ở khu tổng quan
đầu trang. Grid đổi `sm:grid-cols-3` → `sm:grid-cols-4`.

**Phương án C — Giữ 3 card, nhưng đổi hẳn cách trình bày** (to hơn, thêm sparkline nhỏ hoặc %
so với TB N ngày trước) — cần dữ liệu lịch sử, có thể cần query mới → phạm vi lớn hơn nhiều,
không khuyến nghị cho vòng polish này.

**Khuyến nghị của tôi: Phương án A** — tận dụng đúng không gian card đã có (72px), không thêm
hộp mới (giữ gọn theo đúng hướng p1-07), thêm số liệu THẬT SỰ MỚI (chưa hiện ở đâu khác) thay vì
lặp số đã có ở tab bar.

## 5. Chiều cao trang (điểm 5)

Đề xuất kỹ thuật: đổi cấu trúc `page.tsx` từ "page scroll tự do + mỗi bảng tự `max-h-[70vh]`"
sang "khoá chiều cao viewport 1 lần ở gốc, phần còn lại chia đều":

```tsx
// Thay cấu trúc hiện tại (page.tsx):
<div className="@container/main flex flex-col gap-6">
  <HubPageHeader />
  <HubKpiStrip />
  ...
</div>

// Bằng (minh hoạ hướng đi, KHÔNG phải code cuối):
<div className="@container/main flex h-[calc(100vh-var(--header-h))] flex-col gap-4 overflow-hidden">
  <HubPageHeader />       {/* chiều cao tự nhiên */}
  <HubKpiStrip />          {/* chiều cao tự nhiên */}
  <HubTimelineRail />      {/* chiều cao tự nhiên */}
  <HubAlertBanner />       {/* chiều cao tự nhiên, có thể 0 */}
  <div className="grid flex-1 min-h-0 @4xl/main:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] grid-cols-1 gap-6 overflow-hidden">
    <HubQueueTable />      {/* tự overflow-y-auto trong flex-1 min-h-0 */}
    <HubSellingSection />
  </div>
</div>
```

`--header-h` cần đo đúng chiều cao layout shell phía trên (`(main)/layout.tsx` — sidebar/topbar
chung toàn app, KHÔNG phải riêng Hub). Rủi ro: đây là thay đổi cấu trúc lớn hơn các fix khác,
CHỈ áp dụng cho trang Hub (không đụng layout chung), nhưng cần đo thực tế chiều cao topbar/margin
trước khi khoá số — sẽ đo bằng CDP khi implement, không đoán trước ở đây. Có rủi ro phụ: khi
viewport THẤP (laptop 13", zoom 110%) mà tổng chiều cao header+KPI+rail+banner đã > 60% viewport,
phần bảng `flex-1` có thể co lại rất thấp (VD chỉ còn 150px) — cần đặt `min-h-[240px]` sàn cho
phần bảng để không thoái hoá xuống mức vô dụng.

**Phương án nhẹ hơn (rủi ro thấp, làm trước nếu muốn) — không đổi cấu trúc, chỉ siết khoảng
cách:** `gap-6` → `gap-4` toàn trang (tiết kiệm ~32px qua 4 khoảng cách), giảm padding Timeline
Rail (`p-3`→`p-2.5`, card `py-2`→`py-1.5`). Tiết kiệm khoảng 50-60px, không giải quyết triệt để
nhưng an toàn 100%, làm được ngay.

Xem lựa chọn ở §9 Q4.

## 6. Icon khoá — tooltip đúng theo trạng thái (điểm 7)

Thay tooltip tĩnh (`queue-row.tsx`) bằng bảng tra theo `stageOrGateKey`:

| Trạng thái (`stage`) | Tooltip mới |
|---|---|
| `awaiting_draw` | "Đã đóng bán, đang chờ tới giờ quay số — chưa cần hành động." |
| `awaiting_result` | "Chưa có kết quả quay số — cần nhập kết quả (mở chi tiết kỳ để nhập)." |
| `settling` | "Đang kết sổ — hệ thống tự xử lý, chờ vài giây." |
| `voiding` | "Đang huỷ kỳ — hệ thống tự xử lý, chờ vài giây." |
| khác (fallback) | "Không có hành động hàng loạt cho kỳ này — mở chi tiết kỳ để xử lý." |

Đồng thời — phát hiện phụ khi đọc `hub-expand-panel.tsx` (`bulkKindForStatus`, dòng 60-71):
với `status = SalesClosed` (bao cả `awaiting_draw` VÀ `awaiting_result`), hàm này trả `null` →
Expand Panel **không hiện bất kỳ nút hành động nào**, dù `getNextAction` đã tính đúng nhãn
"Công bố kết quả" (nguồn `draw-next-action.ts:59-65`). Nút chỉ "biến mất" âm thầm vì thiếu
`bulkKind` khớp — đây LÀ nguyên nhân gốc khiến kỳ `awaiting_result` trông "bị khoá hoàn toàn,
không làm gì được" (đúng bức xúc của bạn ở điểm 7, không chỉ là lỗi câu chữ tooltip).

**Đề xuất fix thật (không chỉ đổi chữ):** khi `nextAction` tồn tại nhưng `bulkKind === null`
(trường hợp `SalesClosed` → "Công bố kết quả"), render nút đó như **link điều hướng** (không
phải mutation) — click mở `drawOperationsHref(...)` ở tab mới, dùng lại đúng style/icon của
`nextAction` (đồng bộ 100% với trang operations, đúng nguyên tắc đã theo ở p1-05 §B6.2). Việc
này lấp đúng lỗ hổng: trước đây hành động DUY NHẤT khả dụng là bấm icon `ExternalLink` ở góc
header panel (không có label, dễ bị bỏ qua) — giờ có thêm nút CHÍNH ở đúng vị trí quen thuộc.

## 7. Bỏ tab "Cần xử lý" — thiết kế lại 5 tab (điểm 8)

### 7.1 Tab mới đề xuất (mỗi tab = đúng 1 action bulk, hoặc rõ ràng "không bulk")

| Tab mới | Điều kiện (`stage`/`gate`) | Action bulk | Icon |
|---|---|---|---|
| **Chờ mở bán** (MỚI) | `gate ∈ {PendingOpen, Halted}` ∧ chưa hết `closeAt` | Mở bán | `Unlock` |
| Chờ đóng bán *(giữ nguyên, đổi id)* | `stage = PendingClose` | Đóng bán | `Lock` |
| Chưa có KQ *(giữ nguyên)* | `stage ∈ {AwaitingDraw, AwaitingResult}` | — (link "Công bố KQ ↗", xem §6) | `Radio` |
| Chờ kết sổ *(giữ nguyên)* | `stage ∈ {AwaitingSettle, NeedsResettle}` | Kết sổ / Kết sổ lại | `Calculator` |
| Tất cả *(giữ nguyên)* | Toàn bộ (bao cả `NeverOpened`/`Settling`/`Voiding` — không có tab riêng, hiếm gặp) | — | `List` |

**Không mất tín hiệu khẩn cấp khi bỏ "Cần xử lý"** vì 3 cơ chế đã có song song, không phụ thuộc
tab:
1. `HubAlertBanner` (Zone 4) — luôn hiện phía trên bảng, độc lập tab, đã báo `stuck`/
   `neverOpened`/`needsResettle`/`pendingOpen`/`halted` (xem §7.2 sửa nút "Xem N kỳ" trong banner).
2. `getRowAccent()` — tô màu dòng (đỏ/vàng) NGAY TRONG tab tự nhiên của dòng đó (VD 1 dòng
   `PendingClose` bị `stuck` vẫn tô đỏ trong tab "Chờ đóng bán", không cần tab riêng để "nổi
   lên" — nổi lên bằng MÀU, không bằng việc nhảy sang tab khác).
3. Cột "Cảnh báo" + KPI "Rủi ro chi trả" (đã hiện count `alertsCritical` toàn hệ thống).

### 7.2 Sửa 4 nút "Xem N kỳ" trong Alert Banner (đang trỏ `HubGateTab.NeedsAction`)

| Banner item | Trỏ tab MỚI | Vì sao |
|---|---|---|
| `needs-resettle` | `AwaitingSettle` | Đã đúng từ trước, không đổi |
| `never-opened` | `All` | Không còn tab riêng cho `NeverOpened` — hành động thật (huỷ) chỉ có ở trang `operations`, banner nên nói rõ "mở từng kỳ để huỷ" thay vì trỏ tab |
| `stuck` (chung mọi stage) | `All` + `sort=health&dir=desc` | Tái dùng sort "Sức khoẻ" đã có (`QueueSortKey.Health`) — kỳ stuck tự nổi lên đầu bất kể đang ở stage nào, không cần tab riêng |
| `pending-open` | `PendingOpen` *(tab mới)* | Đúng 1 tab, đúng 1 action |
| `halted` | `PendingOpen` *(tab mới, dùng chung với pending-open vì cùng action "Mở bán")* | Gộp — 2 gate cùng dẫn tới cùng 1 hành động |

### 7.3 Tab mặc định khi vào trang (không còn `NeedsAction` để default vào)

Cần bạn chọn 1 trong 3 ở §9 Q2 — không tự quyết vì là lựa chọn hành vi/workflow, không phải kỹ
thuật thuần.

### 7.4 Phạm vi sửa (đã grep xác nhận đúng 6 file, không sót)

`queue-types.ts` (đổi enum + label + icon + `STAGE_TO_TAB`/`GATE_TO_TAB` + `defaultSortForTab`) ·
`filter-sort-rows.ts` (xoá `isNeedsAction`, viết `matchesTab`/`countRowsByTab` theo 5 tab mới) ·
`hub-queue-table.tsx` (`TAB_ICON`) · `hub-page-header.tsx` (nếu subtitle đếm theo `NeedsAction`
— cần đổi công thức đếm "cần xử lý" tổng hợp, xem §9 Q6) · `hub-alert-banner.tsx` (§7.2) ·
`use-hub-context.tsx` (`parseGateTab` default, `EMPTY_TAB_COUNTS`).

---

## 8. P1-06 (điểm 3) — nhắc lại trạng thái, KHÔNG code trong file này

`p1-06-sequential-publish-result` **đã tách file riêng** —
[`p1-06-sequential-publish-result.plan.md`](./p1-06-sequential-publish-result.plan.md)
(3 nút phân tầng: `Huỷ bỏ` ghost · `Xác nhận` outline ít chú ý · `Xác nhận & Kỳ tiếp ▶` default/main
— đã chốt với bạn ở phiên trước). Việc này liên quan trực tiếp tới điểm 7 (tab "Chưa có KQ"): khi
P1-06 code xong, nút "Công bố kết quả ↗" đề xuất ở §6 sẽ **thay** bằng mở dialog sequential ngay
trong Hub (không cần mở tab mới) — nhưng đó là việc của lúc code P1-06, không phải bây giờ.
Đề nghị: **tách file riêng `p1-06-sequential-publish-result.plan.md`** (copy nội dung từ `p1-05`
§B3b) để dễ track độc lập, theo đúng format các plan khác — **đã làm** (§9 Q7 = ngay).

---

## 9. Quyết định cuối (chốt với bạn 08/09 — implement ngay, không hỏi thêm)

| # | Chốt |
|---|---|
| Q1 | **Thiết kế lại hoàn toàn Timeline Rail** — xem §11 (root cause thật: card `flex-1` giãn lấp đầy → `scrollWidth === clientWidth` → **không có gì để kéo**, không phải bug pointer-event) |
| Q2 | Tab mặc định = tab đầu tiên (theo thứ tự mới) có count > 0 |
| Q3 | Thêm card thứ 4 "Đang bán" (Phương án B, §4) |
| Q4 | Làm phương án nhẹ trước (siết `gap`/`padding`, §5) |
| Q5 | "Live" cùng hàng với subtitle |
| Q6 | Subtitle "N kỳ cần xử lý" **VẪN TÍNH CẢ** `Chưa có KQ` vào tổng (khác đề xuất ban đầu của tôi — giữ nguyên cảm giác cấp bách, không giảm số) |
| Q7 | Tách file `p1-06-sequential-publish-result.plan.md` ngay trong lượt này |
| Q8 | Implement luôn, review từng bước bằng CDP/screenshot |

## 10. Bằng chứng thật đo được cho Q1 (thay §3 cũ — root cause KHÁC dự đoán ban đầu)

Test thật bằng cách giả lập `PointerEvent` sequence (pointerdown→pointermove×2→pointerup,
deltaX=150px) qua `Runtime.evaluate` trên trang thật (không phải code review suông):

```json
{"before":0,"after":0,"delta":0}
{"scrollWidth":1292,"clientWidth":1292,"cardCount":11}
```

`scrollWidth === clientWidth` — container **không có overflow để kéo**. Nguyên nhân: `RailCard`
dùng `flex-1` (đổi từ `shrink-0` ở p1-07 §2a để "lấp đầy khi ít kỳ") — nhưng hệ quả phụ là khi
đúng `span` card vừa khít chiều rộng màn hình (trường hợp phổ biến, không hiếm), **KHÔNG BAO GIỜ
có overflow để kéo** — pointer-event logic (`handlePointerDown/Move/Up`) hoàn toàn ĐÚNG về code,
chỉ là không có gì để nó phát huy tác dụng. Đây giải thích chính xác "tôi thử và ko kéo được".

## 11. Thiết kế lại Timeline Rail (thay hoàn toàn §3, theo yêu cầu mới của bạn)

**Yêu cầu của bạn:** mặc định 9 kỳ, kỳ hiện tại ở giữa, có vùng màu nền phân biệt quá
khứ/hiện tại/tương lai, kiểu "timeline".

### 11.1 Vì sao bỏ hẳn mô hình "kéo để lộ thêm kỳ"

Với ràng buộc "9 kỳ mặc định, kỳ hiện tại LUÔN ở giữa" — cửa sổ hiển thị đã CỐ ĐỊNH số lượng
(9) và VỊ TRÍ (căn giữa quanh biên chốt cược). Khi cửa sổ cố định, "kéo ngang để lộ thêm" và "kỳ
hiện tại luôn ở giữa" **xung đột nhau**: kéo sẽ đẩy kỳ hiện tại ra khỏi vị trí giữa. Hai nút
Lùi/Tiến (đã có, nhảy theo `span` cố định) thực ra là cách ĐÚNG cho mô hình "cửa sổ trượt cố
định" — vấn đề trước là chúng bị hiểu lẫn với "phải kéo được" (do card `flex-1` tạo cảm giác có
thể kéo — cursor `grab` hiện ra dù không kéo được gì). Quyết định: **giữ Lùi/Tiến làm điều
hướng chính, bỏ hẳn pointer-event drag** (xoá code, không phải chỉ ẩn) — khớp đúng mô hình mới.

### 11.2 Cấu trúc mới: 3 vùng màu nền (quá khứ / hiện tại / tương lai)

```
┌─────────────────────────────────────────────────────────────────┐
│  vùng QUÁ KHỨ (nền xám nhạt)     │ HIỆN TẠI │  vùng TƯƠNG LAI    │
│  #093    #094    #095    #096    │  #097   │  #098   #099  ...  │
│  (đã đóng/đã settle, mờ hơn)     │ (viền+   │  (sắp mở/đang bán, │
│                                   │  glow)   │  sáng hơn)         │
└─────────────────────────────────────────────────────────────────┘
```

- **Kỳ hiện tại** (`boundaryDrawId`) — LUÔN ở vị trí giữa (`Math.floor(9/2) = 4`, index 4 trong
  9 card) khi đang "theo dõi" (`isFollowing`). Giữ style đã có (`ring-2 ring-primary
  ring-offset-2` + `bg-primary/10` + icon `Radio` pulse) — đã fix đẹp ở p1-07, KHÔNG đổi.
- **Vùng quá khứ** (index < 4, các kỳ đã qua `drawTimeMs`) — thêm 1 dải nền chung PHÍA SAU card
  (không phải border từng card) màu `bg-muted/30`, và card trong vùng này giảm `opacity-75` (báo
  hiệu "đã qua, ít quan trọng hơn" mà không cần đọc từng nhãn trạng thái).
- **Vùng tương lai** (index > 4) — nền trong suốt/`bg-background` (mặc định, không cần nhấn thêm
  vì đây là vùng "sắp tới, cần chú ý" — giữ độ sáng cao nhất, không làm mờ).
- Đường phân chia quá khứ/hiện tại: 1 vạch dọc mờ (`border-l border-dashed border-muted-foreground/20`)
  ngay trước card hiện tại — tín hiệu "đây là NGAY BÂY GIỜ" bổ sung cho ring.

### 11.3 Thay đổi hành vi cửa sổ trượt

- `DEFAULT_SPAN`: `11` → `9` (đúng yêu cầu "mặc định 9 kỳ").
- Cách tính `windowCols`: GIỮ nguyên logic căn giữa hiện có (`centerIdx` quanh `focusId ??
  boundaryDrawId`, `half = floor(span/2)`) — logic này ĐÃ ĐÚNG theo yêu cầu mới, chỉ cần đổi
  hằng số. Riêng khi kỳ hiện tại gần đầu/cuối ngày (không đủ 4 kỳ quá khứ hoặc tương lai) — cửa
  sổ tự dịch (đã có sẵn qua `Math.max(0, ...)`/`Math.min(length, ...)`), kỳ hiện tại KHÔNG còn ở
  đúng giữa hình học nhưng đây là giới hạn tự nhiên (không đủ dữ liệu), không phải bug.
- `RailCard`: đổi lại `flex-1` → `shrink-0 w-32` (width CỐ ĐỊNH, không giãn) — vì giờ số lượng
  card LUÔN cố định = `span` (9), không cần giãn lấp đầy; cố định width giúp vùng màu nền quá
  khứ/tương lai tính toán được chính xác theo tỉ lệ số card, không phụ thuộc kích thước màn hình.
- Bỏ hoàn toàn: `scrollRef`, `handlePointerDown/Move/Up`, `isDragging` state, `dragRef`,
  `DRAG_THRESHOLD_PX`, class `overflow-x-auto`/`cursor-grab`/`cursor-grabbing`/`select-none`.
- Giữ nguyên: nút `Lùi`/`Tiến` (`shiftWindow`), "Về kỳ hiện tại" (`goToCurrent`), `+`/`−`
  (`adjustSpan`) — đổi nhãn `+`/`−` thành "Xem xa hơn"/"Thu gọn" nếu cần rõ nghĩa hơn (tuỳ chọn
  nhỏ, không bắt buộc).

### 11.4 File/dòng cụ thể sẽ sửa trong `hub-timeline-rail.tsx`

| Việc | Vị trí |
|---|---|
| `DEFAULT_SPAN = 11` → `9` | dòng 39 |
| Xoá `DRAG_THRESHOLD_PX`, `dragRef`, `isDragging`, 3 handler pointer | dòng 43, 180-181, 260-297 |
| `RailCard`: `flex-1 min-w-28` → `shrink-0 w-32`, thêm prop `zone: "past"\|"current"\|"future"` | dòng 122-164 |
| Thêm hàm `zoneFor(index, centerIndex): "past"\|"current"\|"future"` | mới, gần `tabForColumn` |
| Container render: bỏ `ref={scrollRef}` + 4 `onPointer*` + `overflow-x-auto`/`select-none`/`cursor-*`, đổi `justify-*` phù hợp khi card width cố định (có thể còn dư khoảng trắng 2 bên nếu ít hơn 9 kỳ trong ngày — chấp nhận, không phải bug) | dòng 362-382 |
| Vùng nền quá khứ: `<div>` tuyệt đối hoặc đơn giản hơn — mỗi card tự nhận `opacity-75 bg-muted/20` khi `zone==="past"` (không cần div riêng, dễ maintain hơn) | trong `RailCard` |

---

## 12. Bảng file sẽ đụng tới khi code (tổng hợp, tham chiếu nhanh)

| File | Điểm liên quan |
|---|---|
| `hub-timeline-rail.tsx` | 1 (thiết kế lại: 9 kỳ căn giữa, 3 vùng màu, bỏ drag §11) |
| `hub-queue-table.tsx` | 2 (checkbox), 8 (tab mới) |
| `queue-row.tsx` | 2 (checkbox), 7 (tooltip khoá) |
| `hub-kpi-strip.tsx` | 4 (thêm card 4 "Đang bán") |
| `page.tsx` | 5 (siết gap/padding) |
| `hub-page-header.tsx` | 5 (Live), 6 (subtitle đếm — vẫn tính cả "Chưa có KQ") |
| `hub-expand-panel.tsx` | 7 (nút "Công bố KQ ↗" khi `bulkKind=null`) |
| `queue-types.ts` | 8 (tab mới, label, icon, STAGE_TO_TAB/GATE_TO_TAB) |
| `filter-sort-rows.ts` | 8 (xoá `isNeedsAction`, `matchesTab`/`countRowsByTab` mới) |
| `hub-alert-banner.tsx` | 8 (sửa đích 4 nút "Xem N kỳ") |
| `use-hub-context.tsx` | 8 (default tab = tab đầu có count > 0, `EMPTY_TAB_COUNTS`) |
| `p1-06-sequential-publish-result.plan.md` *(file mới)* | 3 (tách ngay) |

## 13. Thứ tự thực hiện (implement liên tục, review CDP sau mỗi nhóm)

1. Tách file `p1-06-sequential-publish-result.plan.md` (copy nội dung, không code) — nhanh, làm trước.
2. Checkbox alignment fix (§2b) — nhỏ, độc lập.
3. Timeline Rail redesign (§11) — nhóm lớn nhất, review kỹ bằng CDP/screenshot.
4. Tab redesign (§7) — ảnh hưởng nhiều file, làm sau khi Rail xong vì cả 2 đều đụng `queue-types.ts`.
5. Icon khoá tooltip + nút "Công bố KQ ↗" (§6).
6. KPI card 4 "Đang bán" (§4 phương án B).
7. Live indicator vị trí (§1.5/§9 Q5).
8. Page height — siết gap/padding (§5 phương án nhẹ).
9. Lint + tsc toàn bộ, browser review tổng thể, cập nhật `00-overview.md`.


