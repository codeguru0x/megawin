# P1-07 — UI Polish Round 2 (sau P1-05)

> Trạng thái: ✅ **DONE** (08/09/2026) — xem §11 cho danh sách file đã sửa + kết quả verify.
> Phạm vi: `apps/backoffice/src/app/(main)/games/keno/operations-hub/**` (Keno trước, Bingo18 áp dụng sau khi port).
> Input: feedback UI vòng 2 của user (08/09/2026), sau khi review lại UI đã redesign ở P1-05.

## 0. Bằng chứng đo được (CDP, trước khi viết plan)

| # | Điểm user nêu | Đo được | Nguồn |
|---|---|---|---|
| 1 | KPI border lệch style | `active ? "ring-1 ring-primary" : ""` chỉ áp cho 4/6 card đầu (`hub-kpi-strip.tsx:157`) — "Đang bán"/"Tổng ngày" không có prop `active` | code |
| 2a | Dải kỳ không full-width | `containerRight - lastCardRight = 554px` trống bên phải khi 11 card không đủ lấp container 1846px | CDP `getBoundingClientRect` |
| 2b | Border top kỳ hiện tại "bị mất" | `ring-2 ring-offset-2` đo đủ 4 phía, KHÔNG bị clip (`containerTop:283, cardTop:283` — ring vẽ trong bound) | CDP — khả năng do `overflow-y` cha ăn 2px viền trên khi cửa sổ trình duyệt hẹp, cần tái kiểm ở viewport nhỏ hơn |
| 3a | Kỳ #14/#15 thiếu ngày + checkbox | `DrawIdLabel compact` chỉ hiện badge ngày khi `date !== todayVN()` — 2 kỳ đó nếu vẫn "hôm nay" thì đúng không hiện ngày (không phải bug); checkbox ẩn vì `hasAnyAction() === false` (đã settle/không action) | code `draw-id-label.tsx` + `partition-by-action.ts` |
| 3b | 5B không có ngày | `SellingFullTable` dùng `<DrawIdLabel drawId=...>` — ĐÃ dùng đúng component, tự động hiện ngày nếu khác hôm nay | code `hub-selling-section.tsx:143` |
| 3c | Hover 5B thiếu icon link | `OutlierRow`/`SellingFullTable` link phủ toàn dòng nhưng KHÔNG có icon gợi ý "sẽ mở tab mới" | code |
| 4a | "Chọn vào lô xử lý" dư thừa khi có checkbox | Đúng — nút này gọi `actions.toggleSelect` giống hệt checkbox ở dòng gốc | code `hub-expand-panel.tsx:313-317` |
| 4b | Huỷ kỳ nên chuyển hẳn ra trang operations | Đúng theo yêu cầu — hiện đang có `VoidConfirmDialog` ngay trong panel | code |
| 4c | "Chi tiết kỳ" dư chữ | `<Link>...Chi tiết kỳ <ExternalLink /></Link>` (`hub-expand-panel.tsx:227`) | code |
| 4d | Mốc thời gian có năm | `fmtTime` dùng `toLocaleString("vi-VN", { dateStyle: "short", ... })` → ra `4/9/26` | code `hub-expand-panel.tsx:73` |
| 4e | "Exposure"/"Alert" chưa Việt hoá | `FieldRow label="Exposure (VND)"` / `label="Alert"` (`hub-expand-panel.tsx:270-271,277`) | code |
| 5a | Danh sách dài không scroll | Cả bảng 5A (`rows5A`) và bảng đầy đủ 5B render toàn bộ, không giới hạn `max-h` | code — 5B đã có `max-h-96 overflow-y-auto` nhưng 5A thì KHÔNG |
| 5b | Bảng mất border góc trên khi sticky | `TableHeader` có `bg-card` (thực chất resolve `lab(100 0 0)` = trắng đặc), wrapper `rounded-lg` nhưng `<thead>` các `<th>` đầu/cuối không có `rounded-t`, khi sticky đè lên border wrapper ở góc | CDP: `wrapperBorderRadius:10px`, nhưng thead không kế thừa radius |
| 6a | 5B sort kỳ mới xuống dưới | `findSellingOutliers`/`rows5B` KHÔNG tự sort theo `drawId`/`closeAt` trước khi vào `SellingFullTable` — file hiện tại render theo thứ tự `derivedRows` gốc (thứ tự `rows` trả về từ server, KHÔNG đảm bảo) | code `derive-hub-summary.ts` — `dayFlow` có sort theo `drawTimeMs` nhưng `rows`/`rows5B` giữ thứ tự gốc |
| 6b | Cảnh báo nghiêm trọng nhiều dòng rối | `outliers5B` hiện TẤT CẢ outlier dạng list dọc không cap số dòng, không nhóm theo loại | code `hub-selling-section.tsx` |

## 1. KPI border (điểm 1)

**Vấn đề thật:** không phải "KPI được chọn có border xấu" — mà là 4/6 card có prop `active` (dùng ring khi active), 2 card cuối ("Đang bán", "Tổng ngày") không có khái niệm active vì chúng không tương ứng 1 tab cụ thể → khi đứng cạnh nhau, 4 card có thể hiện ring còn 2 card luôn không có ring, tạo cảm giác "kiểu không đồng bộ". User muốn: bỏ hẳn ring border khi active, nhưng VẪN giữ click → chọn tab.

**Giải pháp:** bỏ hẳn `active`/`ring-1 ring-primary` khỏi `KpiCard`. Thay dấu hiệu "đang chọn" bằng đổi `iconBg`/`iconColor` đậm hơn hoặc gạch chân nhỏ dưới label (giống tab bar `border-b-2` đã dùng ở `hub-queue-table.tsx`) — nhưng vì 5 card đầu tương ứng tab, dùng **`border-b-2` màu primary ở cạnh dưới card** khi active, đồng nhất với chính tab bar bên dưới (cùng ngôn ngữ thị giác, không phải ring mới). 2 card "Đang bán"/"Tổng ngày" không có `active` nên tự động không bao giờ có gạch chân — nhất quán vì chúng THẬT SỰ không phải tab.

```tsx
// KpiCard — bỏ `ring-1 ring-primary`, thay bằng border-b-2 (khớp ngôn ngữ tab bar 5A)
className={cn(
  "flex h-[72px] items-center gap-3 rounded-xl border border-b-2 bg-card p-4 text-left shadow-sm transition-colors",
  onClick ? "cursor-pointer hover:bg-accent/50" : "cursor-default",
  active ? "border-b-primary" : "border-b-transparent",
)}
```

## 2. Timeline Rail (điểm 2)

### 2a. Không full-width khi ít card

**Giải pháp:** đổi `min-w-28 shrink-0` (fixed width) → cho card **giãn lấp đầy** khi không đủ overflow, nhưng **không giãn quá khi đã overflow** (giữ `min-width` sàn). Dùng `flex-1` với `min-w-28` cùng lúc — flexbox tự lấp đầy khi tổng < container, tự chuyển sang scroll khi tổng > container (do `min-w-28` chặn co lại dưới sàn, buộc `overflow-x-auto` kích hoạt).

```tsx
// RailCard root — flex-1 thay shrink-0 (giữ min-w-28 làm sàn)
className={cn("flex min-w-28 flex-1 flex-col gap-1 rounded-lg border ...")}
```

Cần verify: khi 21 card (MAX_SPAN) × min-w-28 (112px) = 2352px > 1846px container → flex-1 tự nhường cho min-width, kích hoạt scroll đúng như cũ. Khi 7-11 card, flex-1 giãn lấp container. **Verify bằng CDP sau khi sửa.**

### 2b. Dấu hiệu kỳ hiện tại "sống động" hơn

User muốn thêm background hoặc icon, không chỉ ring. Giải pháp: giữ `ring-2 ring-offset-2` (đã đúng, không hở góc) NHƯNG thêm:
- Nền `bg-primary/10` (nhẹ, không đụng `HEALTH_CARD_CLASS` vì kỳ hiện tại luôn ở gate Open/PendingClose, hiếm khi đồng thời stuck).
- 1 icon nhỏ góc trên-trái, VD `<Radio className="size-3 text-primary animate-pulse" />` — gợi cảm giác "live", đặt cạnh `DrawIdLabel`.
- Label chữ nhỏ "Hiện tại" thay icon nếu icon animate gây rối mắt — **cần hỏi user chọn 1 trong 2** (icon động vs text label tĩnh).

## 3. Draw ID + checkbox + hover icon (điểm 3)

### 3a/3b — Kết luận: KHÔNG phải bug, giữ nguyên logic

`DrawIdLabel` đã đúng thiết kế chốt ở P1-05 (chỉ hiện badge ngày khi khác hôm nay). Checkbox ẩn ở #14/#15 vì đã hết action — đây là hành vi ĐÚNG theo `hasAnyAction`. **Không sửa code**, nhưng cần thêm 1 dòng ghi chú/tooltip ở checkbox column header hoặc ở dòng đó để staff hiểu "không có checkbox = không còn hành động khả dụng cho kỳ này" (tránh hiểu lầm là bug UI).

**Đề xuất nhỏ:** khi `hasAnyAction === false`, hiện icon `Lock`/`Check` xám nhỏ thay khoảng trống hoàn toàn trống — cho biết "đã xử lý xong" thay vì để ô trống gây cảm giác thiếu sót.

### 3c — Thêm icon link khi hover ở 5B

```tsx
// OutlierRow / SellingFullTable row — thêm ExternalLink icon, hiện khi hover (group-hover)
<Link className="group ...">
  ...
  <ExternalLink className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
</Link>
```

## 4. Expand Panel (điểm 4)

1. **Bỏ nút "Chọn vào lô xử lý"** — xoá hẳn khối `{canSelect ? <Button ...>Chọn vào lô xử lý</Button> : null}` (dòng 313-317). Checkbox ở dòng gốc đã đủ.
2. **Chuyển Huỷ kỳ ra khỏi Hub** — xoá khối "Thao tác nguy hiểm" + `VoidConfirmDialog` khỏi `hub-expand-panel.tsx`. Thay bằng: nút "Chi tiết kỳ ↗" ở header đã có sẵn link sang `/operations?drawId=` — đó CHÍNH LÀ nơi huỷ kỳ nên diễn ra (trang đó đã có luồng huỷ đầy đủ với review kỹ). Có thể thêm 1 dòng text nhỏ dưới cùng panel: "Cần huỷ kỳ? Xem chi tiết đầy đủ ↗" trỏ cùng link, để staff biết đường đi thay vì thấy hành động biến mất không lý do.
3. **Bỏ chữ "Chi tiết kỳ"** — chỉ giữ icon `ExternalLink`, thêm `aria-label="Chi tiết kỳ"` cho a11y + `title` cho tooltip khi cần.
   ```tsx
   <Button asChild size="sm" variant="ghost" aria-label="Chi tiết kỳ">
     <Link href={...} target="_blank" rel="noopener" prefetch={false}>
       <ExternalLink className="size-3.5" />
     </Link>
   </Button>
   ```
4. **Mốc thời gian bỏ năm** — sửa `fmtTime`:
   ```ts
   function fmtTime(ms: number | null): string {
     if (ms === null) return "—";
     const d = new Date(ms);
     const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
     const day = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }); // "04/09", không năm
     return `${time} ${day}`;
   }
   ```
   Cân nhắc dùng chung helper `formatTimeShortVN` ở `@megawin/shared/utils` nếu có sẵn pattern tương tự — cần grep trước khi viết mới (tránh trùng lặp §5 code-quality-standards).
5. **Việt hoá "Exposure"/"Alert"** — đổi label:
   - `"Exposure (VND)"` → `"Rủi ro chi trả (VND)"` (đồng bộ thuật ngữ đã dùng ở `selling-outliers.ts` — `ExposureSpike: "Rủi ro chi trả cao"`).
   - `"Alert"` → `"Cảnh báo"`.

## 5. Scroll cho danh sách dài + border góc bảng (điểm 5)

### 5a. Scroll bảng 5A

Bọc `<Table>` trong wrapper `max-h-[...] overflow-y-auto` giống 5B đã làm, NHƯNG 5A có sticky header (`TableHeader className="sticky top-0"`) — sticky chỉ hoạt động đúng trong scroll container xác định. Cần đặt `max-h` hợp lý (VD `calc(100vh - 320px)` hoặc cố định `max-h-[600px]`) để không đẩy toàn trang quá dài. **Cần hỏi user**: giới hạn theo viewport (`max-h-[70vh]`) hay số dòng cố định?

### 5b. Border góc bảng khi sticky

Nguyên nhân: `rounded-lg border` ở wrapper NGOÀI `<Table>`, nhưng `<TableHeader className="sticky top-0 z-10 bg-card">` không tự bo góc trên — khi content bên trong scroll, phần thead "che" đúng góc bo của wrapper (vì thead vuông, nền đặc). Fix: thêm `overflow-hidden` cho wrapper (ép bo góc cắt mọi con lên trên, kể cả sticky child) — CHÚ Ý: `overflow-hidden` + `sticky` bên trong CÙNG scroll container vẫn hoạt động (sticky positioning không bị `overflow-hidden` của ancestor NGOÀI container scroll phá, miễn `overflow-hidden` và scroll container là cùng 1 phần tử hoặc `overflow-hidden` nằm NGOÀI phần tử có `overflow-y-auto`).

```tsx
// Wrapper 5A — thêm overflow-hidden để ép bo góc, tách 1 lớp bọc riêng cho scroll
<div className="overflow-hidden rounded-lg border">
  <div className="max-h-[70vh] overflow-y-auto">
    <Table>...</Table>
  </div>
</div>
```

## 6. Sort + gọn cảnh báo 5B (điểm 6)

### 6a. Sort "kỳ hiện tại lên trên"

Cần làm rõ với user: "kỳ hiện tại" ở 5B nghĩa là kỳ có `closeAtMs` **gần nhất trong tương lai** (sắp đóng bán sớm nhất) hay kỳ **mới mở bán nhất** (`openAtMs` lớn nhất, tức `drawId`/`drawNo` lớn nhất)? Ảnh chụp cho thấy hiện tại sort theo `drawId` DESC (#119 → #111, tức kỳ mới nhất lên đầu) — nhưng "Đóng bán sau" tăng dần theo thứ tự đó (#119 gần đóng bán nhất ở TRÊN). Đây thực ra ĐÃ đúng ý "kỳ sắp đóng bán lên trên". Nghi vấn: có thể ảnh user chụp là bảng ĐẦY ĐỦ 60 kỳ cuộn xuống, và ở đoạn cuối (#001-#017 cũ hơn) mới lộ ra vấn đề. **Cần hỏi lại**: sort hiện tại (theo `closeAtMs` tăng dần = sắp đóng bán trước) có đúng ý muốn, hay muốn sort theo `openAtMs` giảm dần (mới mở bán nhất lên đầu)?

Sửa code (không phụ thuộc câu trả lời, đảm bảo sort NHẤT QUÁN — hiện tại code không sort rows5B tường minh, dựa vào thứ tự gốc từ server):
```ts
// buildQueueTables — sort rows5B theo closeAtMs TĂNG (sắp đóng bán trước) trước khi trả về
const sorted5B = rows5B.toSorted((a, b) => a.ts.closeAtMs - b.ts.closeAtMs);
return { rows5A: sorted5A, rows5B: sorted5B, tabCounts };
```

### 6b. Gọn cảnh báo nghiêm trọng nhiều dòng

Khi `outliers5B.length` lớn (nhiều kỳ cùng cảnh báo `CriticalAlert`), thay hiện toàn bộ dạng list dọc bằng: nhóm theo `reason`, hiện **badge tổng số + nút mở rộng** thay vì N dòng riêng. VD: "⚠ 5 kỳ cảnh báo nghiêm trọng" (1 dòng, click để mở rộng list) — chỉ auto-expand khi ≤3 dòng. Cần quyết định ngưỡng (3? 5?) — **hỏi user**.

## 7. Việc CẦN user chốt trước khi code (vòng 1)

1. KPI active indicator: `border-b-2` (khớp tab bar) — OK hay muốn phương án khác?
2. Timeline Rail kỳ hiện tại: icon động (`Radio` pulse) hay text label tĩnh "Hiện tại"?
3. Giới hạn chiều cao scroll bảng 5A: theo `vh` hay số dòng cố định? Gợi ý `max-h-[70vh]`.
4. Sort 5B: theo `closeAtMs` tăng (sắp đóng bán lên đầu, ĐANG đúng theo code) hay theo `openAtMs`/`drawNo` giảm (mới mở bán lên đầu)?
5. Ngưỡng gộp cảnh báo outlier 5B: gộp khi > mấy dòng?
6. Xác nhận: bỏ hẳn Huỷ kỳ khỏi Hub, chỉ còn ở trang `operations` — đúng ý muốn 100%?

## 8. Vòng feedback 2 (08/09/2026, sau khi đọc §0-7) — Header Live, DrawIdLabel, KPI tài chính, bulk settle limit

### 8.1. Header — bỏ icon reload + text đếm giây, dùng "Live" pulse

**Hiện trạng đo được** (`hub-page-header.tsx` `RefreshButton`, dòng 36-84): nút ghost gồm `RotateCw`
(quay khi `isFetching`) + `<span>{elapsedSec} trước</span>` cập nhật mỗi giây qua DOM ref (không
re-render), đổi màu icon sang amber khi `elapsedSec > 3 × pollSeconds` (dữ liệu cũ).

**Tiền lệ "Live" đã có trong repo** — KHÔNG phải phát minh mới, tái dùng đúng pattern
`operations/_lib/sections/analytics/live-feed.tsx:204-207`:
```tsx
<span className="ml-auto flex items-center gap-1 text-xs text-sky-600 font-medium">
  <span className="size-1.5 rounded-full bg-sky-500 animate-pulse" />
  Live
</span>
```
Đây chính xác là "icon radio Live" người dùng nhắc tới (chấm tròn nhấp nháy, không phải icon
`Radio` của lucide — `Radio` trong repo hiện dùng làm ICON LOGO trang `operations`/tab "Chưa có KQ",
không phải chỉ báo live).

**Thiết kế mới cho `RefreshButton`:**
- Bỏ hẳn `RotateCw` + chữ "Ns trước".
- Thay bằng chấm tròn `animate-pulse` (dùng lại pattern trên) + chữ "Live" — mặc định màu
  `bg-emerald-500`/`text-emerald-600` (khác `sky` của live-feed để không trộn với feed cược, nhưng
  cùng NGÔN NGỮ "chấm nhấp nháy + chữ ngắn").
- **Vẫn giữ được tín hiệu "dữ liệu cũ"** (yêu cầu ẩn nhưng không được bỏ chức năng): khi
  `elapsedSec > 3 × pollSeconds`, đổi chấm + chữ sang amber và text đổi thành "Chậm" — vẫn 1 dòng
  ngắn, không thêm số giây đếm.
- **Vẫn giữ click-to-refresh** (đã có sẵn keyboard shortcut `r` gọi `actions.refresh`, không đổi):
  bọc trong `<button>` như cũ, `title` đổi thành tooltip "Làm mới (r) — cập nhật lần cuối: {absTime}"
  để KHÔNG mất hoàn toàn thông tin "bao lâu trước" — chỉ chuyển từ hiện luôn (ồn) sang hiện khi hover
  (đúng tinh thần "gọn gàng" người dùng yêu cầu).

```tsx
// RefreshButton — thay nội dung children, giữ nguyên toàn bộ logic đo elapsedSec/stale (chỉ đổi
// PHẦN HIỂN THỊ, không đổi cơ chế tick 1s bằng DOM ref).
<Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" disabled={state.isFetching}
        onClick={actions.refresh} title="Làm mới (r)">
  <span ref={dotRef} className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
  <span ref={spanRef} className="font-medium text-emerald-600 text-xs">Live</span>
</Button>
```
`spanRef`/`dotRef` trong `tick()` đổi `className`/`style.color` giữa emerald (tươi) và amber (cũ)
thay vì set `textContent` số giây — cùng cơ chế `useRef` không re-render đã có, chỉ đổi cái gì bị
set.

**Không cần hỏi thêm** — đây là thay 1-1 theo yêu cầu rõ, dùng tiền lệ có sẵn trong repo.

### 8.2. DrawIdLabel — ngày hiển thị là ngày QUAY, không phải ngày tài chính (đã đúng, giữ nguyên)

**Câu hỏi người dùng:** badge ngày ở `DrawIdLabel` có gây nhầm với "ngày tài chính" (mốc cắt 11:00
VN) không?

**Đọc code để trả lời chính xác, không suy đoán:**
- `drawId = generateKenoDrawId(drawDate, drawNo)` (`create-draw.ts:83`) — `drawDate` là ngày quay
  do staff CHỌN lúc tạo kỳ (`YYYY-MM-DD`, tham số `drawDate` của `createDrawSlotSchema`), tức ngày
  **lịch** của `drawTime`, không liên quan mốc tài chính.
- `financialDate` là field HOÀN TOÀN KHÁC, tính riêng từng kỳ ngay dưới đó (`create-draw.ts:90-91`,
  comment gốc): *"mốc tài chính là 11:00 VN, còn firstDrawTime sớm hơn nên các kỳ đầu ngày thuộc
  financialDate của NGÀY [trước]"* — nghĩa là 1 kỳ có THỂ có `drawDate` (phần trong `drawId`) là
  "07/09" nhưng `financialDate` là "06/09" nếu quay trước 11:00. Đây là 2 trục dữ liệu SONG SONG,
  không trục nào là "bản đúng duy nhất" của trục kia.
- `DrawIdLabel` chỉ đọc phần `drawDate` từ `drawId` (`parseDrawId` tách theo `.` đầu tiên) — **không
  hề động tới `financialDate`**. Badge hiện đúng "kỳ này được lên lịch quay ngày nào", không phải
  "kỳ này thuộc kỳ kế toán nào".

**Kết luận: KHÔNG có rủi ro nhầm lẫn thật trong thiết kế hiện tại**, vì lý do kiến trúc, không phải
suy đoán:
1. Hub CHỦ ĐỘNG không hiện `financialDate` ở BẤT KỲ đâu (comment gốc `hub-page-header.tsx:9-12`:
   *"KHÔNG hiện Ngày tài chính... hiện 1 giá trị duy nhất gây hiểu sai kỳ nào thuộc ngày nào"*) — nên
   trên toàn màn hình Hub chỉ có DUY NHẤT một khái niệm "ngày" hiển thị (ngày quay). Không có 2 con số
   ngày cạnh nhau để staff lẫn giữa 2 khái niệm.
2. Mục đích DUY NHẤT của badge là disambiguation khi 2 kỳ trùng `drawNo` ở 2 ngày quay khác nhau
   (JSDoc gốc `draw-id-label.tsx:6-11`) — đúng bài toán "ngày quay", không phải bài toán "ngày kế
   toán".
3. Tooltip hover LUÔN hiện `drawId` đầy đủ dạng ISO (`2026-09-07.015`) — staff cần biết chính xác
   ngày quay (để không đóng/kết sổ nhầm kỳ) tra được ngay, không phụ thuộc badge rút gọn.

**Cải thiện nhỏ (không phải sửa lỗi, chỉ làm tường minh hơn):** đổi nội dung tooltip từ raw `drawId`
sang có nhãn rõ nghĩa, phòng trường hợp staff mới chưa quen format `YYYY-MM-DD.NNN`:
```tsx
// TooltipContent — thêm nhãn "Ngày quay" tường minh, tránh staff đoán đây là ngày gì
<TooltipContent className="tabular-nums">
  Ngày quay {parsed.date.slice(8, 10)}/{parsed.date.slice(5, 7)}/{parsed.date.slice(0, 4)} · {drawId}
</TooltipContent>
```
**Quyết định: giữ nguyên toàn bộ logic hiển thị `DrawIdLabel`**, chỉ thêm nhãn "Ngày quay" vào
tooltip cho rõ nghĩa. Không đổi điều kiện hiện badge, không thêm badge tài chính nào khác — đúng
quyết định đã chốt ở P1-05 (không lộ khái niệm "ngày tài chính" ra Hub).

### 8.3. KPI — thay số đếm trùng tab bằng số liệu tài chính có breakdown tồn đọng/tổng

**Vấn đề thật, không phải cảm tính:** 4/6 card KPI hiện tại (`Cần xử lý`, `Chờ đóng bán`, `Chưa có
KQ`, `Chờ kết sổ`) hiện `value = state.tabCounts[tab]`/`state.funnel.x.count` — **CHÍNH XÁC** con số
đã hiện dưới dạng badge trên tab tương ứng ở `hub-queue-table.tsx` ngay dưới. `sub` (health breakdown:
"N kỳ treo"/"N kỳ cảnh báo") là thông tin phụ thêm duy nhất, không đủ để biện minh cho việc lặp số
to ở `value`.

**Dữ liệu THỰC SỰ có sẵn** (đọc `OpsHubDrawRow`, `hub-snapshot.dto.ts:56-81` — không suy đoán):
`revenue`, `entries`, `sets`, `largeBetCount`, `exposureRaw`, `alertsOpen`, `alertsCritical`. **KHÔNG
có** `playerCount`/số người chơi, **KHÔNG có** `commission`/hoa hồng ở tầng aggregate này.

**Vì sao "số người chơi" và "hoa hồng" KHÔNG khả thi trong scope P1-07** (nói rõ để không hứa hẹn
sai, đây là giới hạn kiến trúc, không phải ngại làm):
1. `HubStatsRow` (nguồn duy nhất của `revenue/entries/sets/...`, `betting-stats-repo.ts`) là 1 trong
   4 query CỐ ĐỊNH của toàn trang Hub (ràng buộc kiến trúc ghi rõ ở `get-ops-hub-snapshot.ts:55-63`:
   *"đúng 4 query, KHÔNG tỷ lệ với số kỳ"*) — thêm "số người chơi duy nhất" (`distinct playerId`)
   là AGGREGATION KHÁC, không nằm trong doc stats hiện có, sẽ phải thêm 1 pipeline mới → phá ràng
   buộc 4-query hoặc làm chậm mỗi lần poll (Hub poll mỗi `pollSeconds`, hiện ~10s).
2. "Hoa hồng có thể trả" là khái niệm B2B theo **tenant** (`commissionRate` snapshot per-tenant,
   xem `operator-monorepo-structure.mdc` §2 bảng va chạm — core Keno phục vụ NHIỀU tenant cùng lúc
   trên 1 kỳ). `revenue` hiện tại là tổng CHUNG mọi tenant trên 1 kỳ — không tách theo tenant ở tầng
   Hub. Muốn có "hoa hồng" đúng nghĩa phải: (a) tách `revenue` theo tenant TRONG mỗi kỳ (query nặng
   hơn hẳn), (b) nhân với `commissionRate` từng tenant, (c) cộng lại — đây là công thức của
   **báo cáo settle theo ngày/tenant** (`system-settle-tenant-daily-repo.ts`, `publish-settle-daily.ts`
   — đã tồn tại ở trang report riêng), KHÔNG phải nghiệp vụ của Ops Hub (Hub theo dõi VÒNG ĐỜI kỳ
   quay, không phải báo cáo tài chính theo tenant). Nhồi vào đây là trộn 2 trang có mục đích khác
   nhau.

→ **Đề xuất: bỏ hẳn ý "số người chơi"/"hoa hồng" khỏi KPI Hub** — đúng nơi của nó là trang report
tài chính đã có sẵn, không phải Ops Hub. Tập trung vào ĐÚNG dữ liệu đang có nhưng CHƯA khai thác hết:
`revenue`, `entries`, `exposureRaw`.

**Thiết kế mới — money-first, breakdown tồn đọng/tổng (dùng lại ĐÚNG ý người dùng nêu):**

Định nghĩa lại 2 nhóm cho mỗi kỳ: **"đang bán"** (`gate === SaleGate.Open`) vs **"tồn đọng"** (mọi
gate khác — đã hết giờ cược, đang ở 1 trong 4 tab xử lý). Với MỌI field cộng dồn (`revenue`,
`entries`), tính riêng tổng theo 2 nhóm này — **KHÔNG cần query mới**, chỉ là 1 lần cộng khác trong
`useHubKpiStats` (đã có vòng lặp `state.rows` sẵn, chỉ thêm nhánh `if/else` theo `gate`).

```ts
// useHubKpiStats — thêm 2 biến tách theo gate, CÙNG 1 vòng lặp đã có (không thêm query/lần lặp)
interface KpiMoneyBreakdown {
  total: number;
  pending: number; // gate !== Open — "tồn đọng chưa xử lý"
}
// revenue: { total: totalRevenue, pending: pendingRevenue }
// entries: { total: totalEntries, pending: pendingEntries }
// exposure: { total: totalExposure, pending: pendingExposure } — exposureRaw CHỈ có nghĩa
//   cảnh báo ở kỳ CHƯA kết sổ, cộng dồn toàn bộ rows đang theo dõi là hợp lệ (không cap).
```

**3 card tài chính thay thế (đổi vị trí 2 card "Đang bán"/"Tổng ngày" cũ, giữ 4 card đếm việc đầu
— 4 card đó KHÔNG trùng lặp 100% vì còn `healthSub`, xem lại quyết định §7.1 cũ nếu muốn đổi luôn cả
4):**

| Card | `value` (to, chính) | `sub` (breakdown) |
|---|---|---|
| **Tổng tiền cược** | `formatMoneyCompact(revenue.total)` | `"{formatMoneyCompact(revenue.pending)} tồn đọng"` (hoặc "—" nếu `pending = 0`) |
| **Tổng số vé** | `formatNumberVN(entries.total)} vé` | `"{formatNumberVN(entries.pending)} vé tồn đọng"` |
| **Rủi ro chi trả** | `formatMoneyCompact(exposure.total)` (nhãn kèm "chưa cap" theo đúng quy tắc §3.4 guideline đã áp ở expand panel) | `"{alertsCritical} cảnh báo nghiêm trọng"` nếu > 0, else "Bình thường" |

Card "Đang bán" (đếm kỳ, không phải tiền) **dời xuống làm 1 dòng trong `HubAlertBanner`/không cần
card riêng** — vì "đang bán" không phải "việc cần xử lý", nó là trạng thái BÌNH THƯỜNG (đa số kỳ),
đặt cạnh 4 card "cần xử lý" tạo cảm giác sai rằng nó cùng loại "công việc tồn đọng". **Cần hỏi
người dùng**: đồng ý bỏ card "Đang bán" dạng đếm kỳ khỏi KPI (đã có ở tiêu đề Timeline Rail /
đầu Zone 5B rồi, không mất thông tin) để đổi 3 slot cho 3 card tài chính trên?

**Layout 7 card (4 đếm việc + 3 tài chính) không vừa lưới `lg:grid-cols-6` cũ** → đổi
`lg:grid-cols-7` hoặc gộp "Cần xử lý" + sức khoẻ vào 1 card rộng hơn (`col-span-2`). **Cần hỏi**:
ưu tiên giữ đủ 4 card đếm việc (7 card tổng) hay rút gọn 4 card đếm việc xuống còn hiện qua tab bar
(bỏ hẳn khỏi KPI, KPI chỉ còn 3 card tài chính + có thể thêm "Tổng số kỳ đang theo dõi")?

### 8.4. Giới hạn kết sổ đồng thời — ĐÃ giải quyết từ P0-04, không cần UI mới

**Câu hỏi người dùng:** nếu kết sổ đồng thời có giới hạn số kỳ tối đa, nên thiết kế UI theo hướng
"chỉ chọn tối đa 5 kỳ" hay "gửi lên, chờ xong lại gửi tiếp" — hướng nào đơn giản, dễ kiểm soát lỗi?

**Đọc code để trả lời bằng bằng chứng, không thiết kế lại cái đã có:**

Có **2 hằng số khác nhau**, dễ nhầm là 1 (`bulk-limits.ts`):
- `BULK_MAX_DRAWS = 50` — trần **client được chọn** mỗi lần bấm nút bulk. Zod chặn ở route
  (`bulkDrawIdsSchema.max(BULK_MAX_DRAWS)`, `schema.ts:64-68`) — vượt trần bị từ chối NGAY, không
  submit được.
- `BULK_CONCURRENCY = 5` — trần **song song bên trong 1 request đã được chấp nhận**, xử lý HOÀN TOÀN
  ở server, KHÔNG lộ ra client. `runBulkDrawAction` (`bulk-runner.ts:37-39`) tự chia `drawIds` (tối
  đa 50) thành các lô 5, chạy `Promise.all` cho lô hiện tại, ĐỢI XONG lô đó rồi mới chạy lô tiếp
  theo — tuần tự giữa các lô, song song TRONG mỗi lô. VD chọn 23 kỳ → 5 lô (5+5+5+5+3), server tự
  chạy lô 1 xong mới sang lô 2... toàn bộ trong **1 lần bấm nút, 1 request HTTP**.

**Kết luận: chính là "Phương án B" người dùng đề xuất ("gửi lên và chờ kết sổ xong lại gửi tiếp") —
nhưng đã được làm ở TẦNG SERVER, tự động, trong suốt với người dùng**, không phải 2 lựa chọn UI
loại trừ nhau. Ưu điểm hơn cả 2 phương án người dùng đưa ra:
- Không cần "chọn tối đa 5" (Phương án A) — bức bối, staff có thể có backlog 20-30 kỳ dồn từ ca
  trước, giới hạn 5 buộc bấm 6 lần.
- Không cần tự tay "gửi lô 2" sau khi lô 1 xong (Phương án B thủ công) — server tự nối tiếp, 1 lần
  bấm là xong tới 50 kỳ.
- Lỗi ĐƯỢC KIỂM SOÁT tốt hơn cả 2 phương án: mỗi kỳ trong mỗi lô có `try/catch` RIÊNG
  (`bulk-runner.ts:44-61`) — 1 kỳ lỗi KHÔNG chặn các kỳ còn lại (partial success), trả về đủ
  `results[]` cho FE tô từng dòng thành công/thất bại, không phải "thành công hết hoặc thất bại
  hết".

**UI hiện tại đã đúng theo cơ chế này** — `hub-bulk-action-bar.tsx:57,120-125` đã có `overCap` check
(`validSelection.size > BULK_MAX_DRAWS`) disable toàn bộ nút + banner *"Chọn tối đa 50 kỳ mỗi lần —
bỏ chọn một vài kỳ trước"* khi vượt 50. Không cần thêm UI chọn "5 kỳ" nào — con số 5 không bao giờ
cần lộ ra người dùng vì nó là cơ chế NỘI BỘ đảm bảo an toàn hạ tầng (Step Functions), không phải
giới hạn nghiệp vụ.

**Việc DUY NHẤT còn thiếu (nhỏ, không phải thiết kế lại):** khi bấm kết sổ 30-50 kỳ, request có thể
mất vài giây (comment gốc `bulk-limits.ts:6-8`: *"50 kỳ × 5 đồng thời = 10 chunk... ≈ 2s"*) — nút
"Xác nhận" trong `BulkConfirmDialog` hiện chỉ disable + có thể có spinner mặc định của `Button`, CHƯA
có text tiến độ dạng "đang xử lý lô..." vì server không trả tiến độ giữa chừng (1 request, 1 response
cuối). **Đề xuất nhỏ**: đổi text nút khi `isPending` từ "Đang xử lý..." sang có số lượng, VD
`"Đang kết sổ {N} kỳ..."` — chỉ đổi text, không cần progress bar thật (không có dữ liệu tiến độ thật
để hiện, hiện giả sẽ SAI với `code-quality-standards.mdc` — không bịa state không có).

**Không cần hỏi thêm ở mục này** — đã có bằng chứng đầy đủ, không phải quyết định thiết kế mới.

## 9. Tổng hợp toàn bộ việc CẦN user chốt trước khi code (vòng 1 + vòng 2)

**Đã tự quyết, không cần hỏi** (có tiền lệ/bằng chứng rõ trong code): §8.1 (Live indicator),
§8.2 (DrawIdLabel giữ nguyên + thêm nhãn tooltip), §8.4 (bulk settle limit — không cần UI mới).

**Còn cần user trả lời:**

1. KPI active indicator: `border-b-2` (khớp tab bar) — OK hay muốn phương án khác?
2. Timeline Rail kỳ hiện tại: icon động (`Radio` pulse) hay text label tĩnh "Hiện tại"?
3. Giới hạn chiều cao scroll bảng 5A: theo `vh` hay số dòng cố định? Gợi ý `max-h-[70vh]`.
4. Sort 5B: theo `closeAtMs` tăng (sắp đóng bán lên đầu, ĐANG đúng theo code) hay theo
   `openAtMs`/`drawNo` giảm (mới mở bán lên đầu)?
5. Ngưỡng gộp cảnh báo outlier 5B: gộp khi > mấy dòng?
6. Xác nhận: bỏ hẳn Huỷ kỳ khỏi Hub, chỉ còn ở trang `operations` — đúng ý muốn 100%?
7. **(mới §8.3)** Đồng ý bỏ hẳn "số người chơi"/"hoa hồng" khỏi KPI Hub (thuộc trang report tài
   chính riêng, không phải Ops Hub) — chỉ khai thác sâu hơn `revenue`/`entries`/`exposureRaw` đã có?
8. **(mới §8.3)** Đồng ý bỏ card "Đang bán" dạng đếm kỳ khỏi KPI (đổi thành 3 card tài chính:
   Tổng tiền cược, Tổng số vé, Rủi ro chi trả — mỗi card có sub breakdown "tồn đọng")?
9. **(mới §8.3)** Layout 7 card (4 đếm việc + 3 tài chính) hay rút gọn 4 card đếm việc (đã có ở tab
   bar) để KPI chỉ còn 3-4 card tài chính, gọn hơn?

## 10. QUYẾT ĐỊNH CUỐI (user chốt 08/09/2026) — bắt đầu code từ đây

1. KPI scope: **đồng ý** bỏ player count/hoa hồng, chỉ dùng `revenue`/`entries`/`exposureRaw`.
2. KPI card "Đang bán" (đếm kỳ): **bỏ hẳn** — đã có ở Zone 5B/Timeline Rail, không mất thông tin.
3. KPI layout: **rút gọn 4 card đếm việc** (Cần xử lý/Chờ đóng bán/Chưa có KQ/Chờ kết sổ) — đã có
   đủ ở badge tab bar `hub-queue-table.tsx`, không lặp trong KPI nữa.
   → **KPI Strip mới CHỈ CÒN 3 card tài chính**: Tổng tiền cược / Tổng số vé / Rủi ro chi trả.
4. KPI active indicator: **bỏ hẳn**, không cần border-b-2 hay ring nào — lý do user nêu đúng: sau
   khi rút gọn (mục 3), 3 card còn lại đều KHÔNG tương ứng 1 tab cụ thể nữa (tài chính là dữ liệu
   tổng hợp, không phải bộ lọc) nên "active state" không còn ý nghĩa. 3 card mới **không có
   `onClick`** (trừ khi cần click để cuộn tới Zone 5B như style card "Đang bán" cũ — xem quyết định
   nhỏ khi code: giữ click-scroll cho card liên quan, bỏ nhánh active/tô màu).
5. Timeline Rail — kỳ hiện tại: **icon động** (`Radio` nhấp nháy + nền `bg-primary/10` nhẹ).
6. Bảng 5A — scroll: **`max-h-[70vh]`**.
7. Sort 5B: **`closeAtMs` tăng dần** (kỳ sắp đóng bán sớm nhất lên đầu — giữ đúng hướng code hiện
   tại, chỉ cần thêm sort TƯỜNG MINH thay vì dựa vào thứ tự ngầm định).
8. Ngưỡng gộp cảnh báo outlier 5B: **> 5 dòng** thì gộp thành badge tổng.
9. Void: **bỏ hẳn** khỏi Ops Hub (expand panel) — chỉ còn ở trang `operations` chi tiết.

**Layout KPI mới (thay hoàn toàn `grid-cols-6` cũ):**

```tsx
// grid-cols-3 — 3 card tài chính, chiều cao 72px giữ nguyên, KHÔNG có active/ring
<div className="grid gap-3 sm:grid-cols-3">
  <KpiCard icon={Wallet} label="Tổng tiền cược" value={formatMoneyCompact(revenue.total)}
           sub={revenue.pending > 0 ? `${formatMoneyCompact(revenue.pending)} tồn đọng` : "Không tồn đọng"} />
  <KpiCard icon={Ticket} label="Tổng số vé" value={`${formatNumberVN(entries.total)} vé`}
           sub={entries.pending > 0 ? `${formatNumberVN(entries.pending)} vé tồn đọng` : "Không tồn đọng"} />
  <KpiCard icon={AlertTriangle} label="Rủi ro chi trả (chưa cap)" value={formatMoneyCompact(exposure.total)}
           sub={alertsCritical > 0 ? `${alertsCritical} cảnh báo nghiêm trọng` : "Bình thường"} />
</div>
```

`pending` = tổng theo `gate !== SaleGate.Open` (mọi kỳ đã hết giờ cược, đang ở pipeline xử lý) — giữ
đúng định nghĩa "tồn đọng chưa xử lý" theo đúng ý user nêu ở §8.3.

## 11. HOÀN THÀNH (08/09/2026) — implement xong toàn bộ §10, verify lint + tsc + browser (CDP)

Trạng thái: ✅ **DONE**. Toàn bộ 9 quyết định ở §10 đã code xong cho Keno; Bingo18 sẽ nhận cùng thay
đổi khi port UI (component `_lib/` dùng chung logic, chỉ khác route Keno-specific).

### 11.1. Danh sách file đã sửa

| File | Thay đổi |
|---|---|
| `hub-page-header.tsx` | `RefreshButton` — bỏ `RotateCw` + đếm giây, thay bằng chấm `animate-pulse` + chữ "Live"/"Chậm" (§8.1). `title` hiện giờ cập nhật lần cuối đầy đủ khi hover. |
| `draw-id-label.tsx` | `TooltipContent` thêm nhãn "Ngày quay {dd/mm/yyyy} · {drawId}" (§8.2) — KHÔNG đổi điều kiện hiện badge. |
| `hub-kpi-strip.tsx` | Viết lại hoàn toàn — 3 card tài chính (Tổng tiền cược/Tổng số vé/Rủi ro chi trả), mỗi card có `total`+`pending` breakdown theo `gate !== SaleGate.Open`. Bỏ hẳn 4 card đếm việc, bỏ hẳn active/ring/click (mục 3+4 §10). |
| `hub-timeline-rail.tsx` | `RailCard` đổi `shrink-0` → `flex-1` (giữ `min-w-28` làm sàn) — full-width khi ít card (§2a). Kỳ hiện tại: thêm icon `Radio` `animate-pulse` + nền `bg-primary/10`, giữ `ring-2 ring-offset-2` (§10 mục 5). |
| `filter-sort-rows.ts` | `buildQueueTables` — thêm sort **tường minh** `rows5B.toSorted((a,b) => a.ts.closeAtMs - b.ts.closeAtMs)` (§10 mục 7) — trước đó dựa vào thứ tự ngầm định từ snapshot. |
| `hub-queue-table.tsx` | Wrapper bảng 5A: `<div className="overflow-hidden rounded-lg border"><div className="max-h-[70vh] overflow-y-auto">...</div></div>` (§5b + §10 mục 6). Checkbox header/cell: hiện icon `Lock` xám khi không còn action (§3a mở rộng). Header "Exposure"→"Rủi ro", "Alert"→"Cảnh báo". |
| `queue-row.tsx` | Checkbox cell — khi `canSelect === false`, hiện `Lock` icon xám + tooltip "Đã xử lý xong — không còn hành động khả dụng" thay vì ô trống. |
| `hub-selling-section.tsx` | `OutlierRow`/`SellingFullTable` — thêm `ExternalLink` icon `opacity-0 group-hover:opacity-100` (§3c). Gộp outlier khi `outliers5B.length > 5` thành nút "và N kỳ khác cần chú ý" (§10 mục 8), có nút "Thu gọn" khi mở rộng. |
| `hub-expand-panel.tsx` | Bỏ nút "Chọn vào lô xử lý" (§4 mục 1). Bỏ hẳn khối "Thao tác nguy hiểm" + `VoidConfirmDialog` (§4 mục 2, §10 mục 9). Link header chỉ còn icon (`size="icon"`, không có text, `title` cho a11y) (§4 mục 3). `fmtTime` bỏ năm — `{giờ:phút:giây} {dd/mm}` (§4 mục 4). `FieldRow` label Việt hoá: "Rủi ro chi trả (chưa cap)", "Cảnh báo" (§4 mục 5). |
| `bulk-confirm-dialog.tsx` | Xoá hẳn `VoidConfirmDialog` + `useState`/`Checkbox`/`Input`/`Label`/`XCircle` imports không còn dùng — chỉ còn `BulkConfirmDialog` cho 3 action bulk (settle/close-sales/open-sales). Header comment cập nhật phản ánh Void đã bỏ hoàn toàn khỏi Hub, không chỉ khỏi bulk bar. |

### 11.2. Điểm khác biệt nhỏ so với plan gốc (quyết định khi code, đã hợp lý theo ngữ cảnh)

- **§10 mục 4** plan có nhắc "giữ click-scroll cho card liên quan" như một tuỳ chọn cân nhắc — quyết
  định cuối khi code: bỏ hẳn `onClick` ở cả 3 card tài chính mới, vì không card nào còn tương ứng
  1-1 với hành động cuộn tới Zone 5B/tab cụ thể (dữ liệu tổng hợp, không phải bộ lọc) — khớp đúng lý
  do "active state không còn ý nghĩa" đã nêu trong quyết định 4.
- **§4 mục 2** đề xuất giữ 1 dòng text "Cần huỷ kỳ? Xem chi tiết đầy đủ ↗" ở cuối panel — bỏ qua vì
  link header (icon `ExternalLink`) đã đủ rõ là đường dẫn duy nhất tới trang có đầy đủ hành động,
  thêm dòng text lặp lại ý đó ở dưới cùng chỉ tạo nhiễu.

### 11.3. Verify đã thực hiện

1. **Biome**: `npx biome check` scope `operations-hub/**` + `draw-id-label.tsx` → 0 error, 4 warning
   false-positive đã biết từ trước (Biome không narrow qua `useRef`, xác nhận lại bằng `tsc`).
2. **tsc**: `apps/backoffice` `--noEmit` → sạch hoàn toàn, không có lỗi.
3. **Browser thật (CDP, dev server đang chạy, KHÔNG bấm confirm mutation nào vì dữ liệu thật):**
   - Header: chấm "Live" nhấp nháy hiện đúng, không còn icon reload/số giây.
   - KPI Strip: 3 card tài chính hiện đúng số liệu tổng hợp (`480K`/`20 vé`/`3tr`) kèm breakdown tồn
     đọng ("360K tồn đọng", "14 vé tồn đọng"), không có ring/border active nào.
   - Timeline Rail: card giãn `flex-1` lấp đủ chiều rộng container (11 card lấp hết khung nhìn), kỳ
     hiện tại (#068) có icon `Radio` cạnh mã kỳ + nền tím nhạt + ring — không còn "gạch xanh"/"viền
     hở góc" của bug cũ.
   - Bảng 5A: mở panel kỳ `2026-09-07.004` — nội dung đúng 3 khối (Vì sao/Dòng thời gian/Tiền & rủi
     ro), timestamp không năm (`20:59:13 07-09`), label "Rủi ro chi trả (chưa cap)"/"Cảnh báo" đúng
     tiếng Việt, KHÔNG có nút "Chọn vào lô xử lý", KHÔNG có khối Huỷ kỳ. Header link chỉ còn icon
     (xác nhận `element.textContent === ""`).
   - Checkbox column: kỳ `#014`/`#015` (trạng thái "Chờ kết quả", hết action) hiện icon `Lock` xám
     (`lucide-lock size-3.5 text-muted-foreground/40`) đúng thiết kế; các kỳ còn action hiện checkbox
     bình thường.
   - Scroll bảng 5A: `scrollHeight=2921px` > `clientHeight=580px` (giới hạn 70vh), `overflow-y: auto`
     — xác nhận hoạt động đúng. Wrapper ngoài `border-radius: 10px` + `overflow: hidden` → góc bảng
     không bị mất khi sticky header đè lên.
   - Zone 5B: outlier hiện đúng 5 dòng (#110–#114) + nút "và 1 kỳ khác cần chú ý" (tổng 6 outlier).
     `ExternalLink` icon có class `opacity-0 group-hover:opacity-100` — ẩn mặc định, hiện khi hover.
   - "1 Issue" phát hiện qua Next.js Dev Tools overlay là **hydration mismatch pre-existing** ở
     `src/components/sidebar/nav-main.tsx:224` — xác nhận qua `git log` file này KHÔNG nằm trong diff
     của P1-07, không thuộc phạm vi sửa.
