---
name: ""
overview: ""
todos: []
isProject: false
---

# p1-02 — Bảng 5A/5B, Focus Rail, multi-select, 4 bulk action

> **Phase:** P1 · **Status:** ⏳ pending · **Phụ thuộc:** p1-01, p0-04 · **Chặn:** p1-03
> **UI chuẩn:** [`ops-hub-page-layout.guideline.md`](./ops-hub-page-layout.guideline.md) §1.4.6, §5, §5B, §6, §10
> **Đây là plan khó nhất của P1** — multi-select **không có tiền lệ** trong repo, và là nơi duy nhất
> chạm tiền thật.

## 0. Bản này khác bản trước ở đâu

| Bản trước | Sửa |
|---|---|
| **1 bảng** có filter theo trạng thái | **2 bảng tách biệt** theo `SaleGate` (§2): 5A vận hành (có action), 5B đang bán (chỉ giám sát). Nhồi 105 kỳ đang bán vào cùng bảng làm chìm 20 kỳ cần xử lý |
| 2 action: settle, void | **4 action**: settle, void, **close-sales**, **open-sales** (p0-04). `close-sales` là thao tác **thường xuyên nhất** mà bản cũ không có |
| Filter/sort **không** vào URL ("history rác") | **Vào URL** qua `nuqs` `history:"replace"` — tiền đề "history rác" sai (§5.1) |
| Sort mặc định `drawId` desc | Sort theo **`health` → `ageInStage`** (§4.2). Kỳ mới nhất thường là kỳ **ít cấp bách nhất** |
| Tab `Đã xong` | **Bỏ** — `settled`/`void` không nằm trong query hub, tab luôn rỗng là bug hiển thị |
| Badge hiện `status` thô | Hiện `stage` + hậu tố `health` (guideline §1.5) |
| `VOIDABLE_STATUSES` FE tự liệt kê | Import `isVoidable()` từ package (p0-04 §6) |
| Không nói về chi phí render | §6: một `useMemo` cho **cả 2 bảng**, `memo` row theo primitive, `content-visibility` |

## 1. Phát hiện: repo CHƯA có pattern multi-select

Đã grep toàn bộ `apps/backoffice/src`:

```
enableRowSelection|getIsSelected|toggleAllRowsSelected|rowSelection
→ chỉ 2 file: components/data-table/data-table.tsx, draggable-row.tsx
```

`data-table.tsx:70` có `data-state={row.getIsSelected() && "selected"}` nhưng **không** có
`rowSelection` state, **không** `onRowSelectionChange`, **không** column checkbox. Grep `rowSelection`
trong `data-table/`: **0 match**.

Nghĩa là `DataTable` shell **sẵn sàng** hiển thị row selected nhưng cơ chế selection chưa từng dùng.
Đây là **pattern mới**, không phải copy chỗ nào.

## 2. Hai bảng, không phải một bảng có filter

### 2.1 Phân chia theo `gate`

| Bảng | Chứa | Số dòng thực tế | Có action? |
|---|---|---|---|
| **5A — Vận hành** | `gate ∈ {Ended, PendingOpen, Halted}` | vài chục (bằng backlog) | ✅ checkbox + 4 bulk action |
| **5B — Đang bán** | `gate = Open` | **hàng trăm** | ❌ không checkbox, không action |

Vì sao **không** dùng 1 bảng + filter: 105 kỳ `Selling` và 20 kỳ cần xử lý là **hai bài toán khác
nhau**. Bảng chung buộc mặc định filter, và filter mặc định là thứ người ta tắt đi rồi quên bật lại —
lúc đó 20 dòng cần xử lý chìm giữa 105 dòng bình thường. Tách vật lý thì không có trạng thái nào làm
chìm được 5A.

Hệ quả: **số dòng của 5A phụ thuộc backlog, không phụ thuộc N.** Backlog khoẻ = 5A gần rỗng. Đây là
tính chất làm cả trang không cần virtualization (§6.3).

### 2.2 5B KHÔNG render hàng trăm dòng (guideline §5B)

Ba lớp thu gọn dần:

1. **Lớp 1 — Top-N bất thường** (mặc định mở, ~5 dòng). Chỉ kỳ `revenue > 3 × median(cùng gate)` hoặc
   `revenue = 0 && ageSinceOpen > 30p` hoặc `alertsCritical > 0`. Đây là **thứ duy nhất cần đọc** ở
   nhóm đang bán.
2. **Lớp 2 — sparkline** đã có ở Day Flow (p1-01 §7.3), **không** lặp lại. Bấm cột → lọc Lớp 1.
3. **Lớp 3 — bảng đầy đủ, mặc định ĐÓNG.** Header thu gọn:
   `▸ Xem toàn bộ 105 kỳ đang bán · 1.284 tỷ · 312.480 vé`. Khi mở có ô **search** theo `drawNo`/giờ —
   tìm kiếm là cách đúng để truy cập 105 dòng, không phải cuộn. Trạng thái mở/đóng lưu zustand.

**Chỉ mount Lớp 3 khi mở** (`expanded && <SellingFullTable/>`), không `hidden` bằng CSS. Render 105
dòng rồi ẩn là trả full giá mà không được gì.

## 3. Selection — `Set<drawId>` ở Hub context, KHÔNG TanStack `rowSelection`

| Cách | Ưu | Nhược |
|---|---|---|
| `rowSelection` của TanStack | Có sẵn API | Key là **row index/id**, không phải `drawId`. Mỗi poll `rows` đổi thứ tự/nội dung → selection **trỏ sai kỳ** |
| `Set<drawId>` ở Hub context | Bền qua refetch, bulk API cần đúng `drawId` | Phải tự viết toggle/selectAll |

**Chọn `Set<drawId>`.** Lý do quyết định: trang refetch mỗi ~10s và kỳ settle xong sẽ **rời** `rows`.
Selection theo index sẽ **âm thầm trỏ sang kỳ khác**. Với hành động tác động tiền thật, đây là lỗi
không thể chấp nhận — và là loại lỗi không ai phát hiện khi test tay với data tĩnh.

TanStack Table vẫn dùng cho column def/sort (đã có `DataTable` shell), chỉ **không** dùng
`rowSelection` của nó. Column checkbox đọc/ghi vào context.

### 3.1 Đồng bộ selection sau refetch — derived, KHÔNG effect

```tsx
/**
 * Selection ĐÃ lọc theo `rows` hiện tại.
 *
 * Kỳ đã settle/void xong rời `rows`. Giữ nó trong selection thì bulk action gửi `drawId`
 * không còn hợp lệ → nhận lỗi vô nghĩa, và số trên nút "Kết sổ N kỳ" sai.
 *
 * Tính DERIVED trong render, KHÔNG `useEffect` + `setState`
 * (`vercel-react-best-practices` §5.1) — effect tạo thêm 1 render và có thể loop.
 */
const validSelection = useMemo(() => {
  const available = new Set(rows5A.map((r) => r.drawId));
  return new Set([...selectedIds].filter((id) => available.has(id)));
}, [rows5A, selectedIds]);
```

`selectedIds` thô chỉ là **nơi lưu**; mọi hiển thị/action dùng `validSelection`.

### 3.2 `setState` dạng functional, callback stable

```tsx
const toggleSelect = useCallback((drawId: string) => {
  setSelectedIds((curr) => {
    const next = new Set(curr);
    if (next.has(drawId)) {
      next.delete(drawId);
    } else {
      next.add(drawId);
    }
    return next;
  });
}, []); // ← không dependency (vercel-react-best-practices §5.9)
```

Callback stable là điều kiện để `memo()` trên row component có tác dụng (§6.2). Nếu `toggleSelect` đổi
identity mỗi render thì mọi row re-render mỗi lần bất kỳ thứ gì đổi.

## 4. Tab lọc + sort

### 4.1 Tab của 5A — 5 tab, mặc định `Cần xử lý`

```
[ Cần xử lý (17) ] [ Hết giờ cược (4) ] [ Chưa có KQ (1) ] [ Chờ kết sổ (14) ] [ Tất cả (23) ]
   ↑ mặc định
```

`Cần xử lý` = `health ≠ ok` ∪ `stage ∈ {AwaitingSettle, NeedsResettle, NeverOpened}` ∪
`gate ∈ {PendingOpen, Halted}` ∪ `alertsCritical > 0`.

Định nghĩa này **không** coi `PendingClose` là việc — chốt sổ theo batch là bình thường. Nó chỉ vào
`Cần xử lý` khi `health ≠ ok` (batch đã bỏ sót).

**Không có tab `Đã xong`** — hub query chỉ lấy `DRAW_UNFINISHED_STATUSES` nên `settled`/`void` **không
có trong `rows`**; tab luôn rỗng là bug hiển thị, không phải tính năng. Đúng **5** tab → phím `1`–`5`.

Count trên tab tính từ `derived` của p1-01, **không** query thêm.

**Empty state phải mang thông tin**, không phải hình minh hoạ:

> ✓ Không có kỳ nào cần xử lý · 4 kỳ chờ chốt sổ · 105 kỳ đang bán

Người trực cần phân biệt "không có việc" với "trang bị lỗi".

### 4.2 Sort mặc định theo tab

| Tab | Sort | Lý do |
|---|---|---|
| `Cần xử lý` | `health` desc → `ageInStageSec` desc | Triage: nặng nhất, treo lâu nhất lên đầu |
| Tab chặng cụ thể | `ageInStageSec` desc | Trong cùng chặng, cũ nhất xử lý trước (FIFO) |
| `Tất cả` | `drawTime` asc | Đọc theo trục thời gian |

**Không** mặc định `drawId` desc: kỳ mới nhất thường là kỳ **ít cấp bách nhất**.

`health` là union → sort cần **rank số** (`stuck: 2, warn: 1, ok: 0`) khai cạnh const-object, không so
string. So string sẽ ra thứ tự alphabet (`ok` > `warn` > `stuck`) — **ngược hoàn toàn** và trông vẫn
"chạy được".

## 5. State vào URL

### 5.1 nuqs — tiền đề "history rác" là SAI

Plan cũ từ chối URL vì *"ghi URL mỗi lần đổi tab tạo history rác"*. **Sai**: `nuqs` mặc định
`history: "replace"`, không push entry. Thêm `clearOnDefault: true` để URL sạch khi ở mặc định.

Param: `gate` (tab 5A), `stage`, `sort`, `dir`, `focus` (drawId giữa Focus Rail), `span` (số card).
Đã khai trong `nav-registry` ở p1-01 §2.

Lý do **phải** vào URL: chi tiết kỳ mở **tab mới** (p1-03) → tab hub bị F5/restore session là chuyện
thường trong ca 8 tiếng; mất filter là mất ngữ cảnh sự cố. Và gửi link `?gate=pending_open` cho đồng
nghiệp là cách báo sự cố nhanh nhất.

### 5.2 KHÔNG persist selection

Restore selection cũ rồi người dùng bấm `Kết sổ` → kết sổ tập kỳ họ **không hề chọn trong phiên này**.
Với action tiền, mọi selection phải là hành động tường minh trong phiên hiện tại. Đây là ranh giới an
toàn, không phải lựa chọn UX.

Selection cũng **không** vào URL (cùng lý do — link chứa selection có thể bị bấm bởi người khác).

## 6. Hiệu năng render — 2 bảng, hàng trăm dòng, poll 10s

### 6.1 Một `useMemo` cho cả 2 bảng

```tsx
/**
 * Chia + filter + sort cho CẢ HAI bảng trong 1 lần lặp.
 *
 * `derived.rows` (từ p1-01) đã có `gate`/`stage`/`health`/`ageInStageSec` — plan này KHÔNG
 * dẫn xuất lại. Ở đây chỉ: chia theo `gate`, filter theo tab, sort, và chọn top-N outlier 5B.
 *
 * Viết `rows.filter(...)` nhiều lần cho 5A/5B/top-N là 3-4 lần lặp
 * (`vercel-react-best-practices` §7.6). Gộp 1 vòng `for`.
 *
 * `toSorted()` KHÔNG `sort()`: `rows` thuộc React Query cache, `sort()` mutate nó
 * (§7.12) → dữ liệu cache bị đổi thứ tự sau lưng, và `keepPreviousData` trả về mảng đã bị
 * xáo trộn ở lần render sau.
 */
const { rows5A, rows5B, outliers5B } = useMemo(() => { ... },
  [derived.rows, tab, sort, dir]);
```

Dependency **không** chứa `selectedIds`: đổi selection **không** được làm chạy lại filter/sort. Đây là
lỗi dễ mắc nhất — thêm `selectedIds` vào deps thì mỗi lần tick checkbox là sort lại toàn bộ.

### 6.2 `memo` row theo primitive, không theo object

```tsx
/**
 * Row memo hoá theo PRIMITIVE, không nhận cả object `row`.
 *
 * `derived.rows` là mảng MỚI sau mỗi poll (object identity đổi dù nội dung giống) → `memo`
 * so shallow trên `row` sẽ luôn miss. Truyền các primitive đã dùng để so được thật.
 *
 * `isSelected` là boolean → tick checkbox 1 dòng chỉ re-render ĐÚNG dòng đó, không cả bảng.
 */
const HubRow = memo(function HubRow(props: {
  drawId: string; drawNo: number; stage: OpsStage; health: StageHealth;
  revenue: number; /* … */ isSelected: boolean;
  onToggle: (drawId: string) => void;
}) { ... });
```

`onToggle` phải là callback **stable** (§3.2) — nếu không, `memo` vô dụng.

Không có default value non-primitive nào trong props của component memo hoá
(`vercel-react-best-practices` §5.4) — `= []`/`= {}`/`= () => {}` trong signature tạo instance mới mỗi
render và phá memo âm thầm. Nếu cần default, hoist thành const module-level.

### 6.3 `content-visibility` trước, virtualization CHỈ khi đo được

```css
.hub-row {
  content-visibility: auto;
  contain-intrinsic-size: 0 40px;
}
```

Trình duyệt bỏ layout/paint cho dòng ngoài viewport (`vercel-react-best-practices` §6.2). Rẻ, 0
dependency, không phá `Ctrl+A`/scroll-to-row/in trang.

**Không** thêm `@tanstack/react-virtual` ở P1. Ba lý do cụ thể, không phải "để sau":

1. Chưa có trong deps → +bundle.
2. 5A chỉ vài chục dòng (số dòng = backlog, không = N — §2.1).
3. 5B Lớp 3 mặc định đóng, và khi mở thì cách dùng đúng là **search**, không cuộn.

Ngưỡng xét lại: render > 100ms với 300 dòng, đo bằng React DevTools Profiler. **Ghi số vào PR bất kể
quyết định nào** — để p1-04 và P2 không phải đo lại.

### 6.4 Nhắc lại từ p1-01: không tick 1s

Cột `Trong chặng` hiện `ageInStage` trôi theo giây → dùng `RelativeDuration` ghi DOM qua ref với
interval **dùng chung** (p1-01 §5.4). 200 dòng × `setInterval` riêng = 200 timer.

Sort theo `ageInStageSec` chỉ đổi tại **boundary tick** (p1-01 §5.3), không mỗi giây. Nghĩa là bảng
**không** nhảy thứ tự dưới tay người dùng mỗi giây — vừa đúng hiệu năng, vừa đúng UX.

## 7. Cột bảng 5A (guideline §5.3)

| # | Cột | Align | Ghi chú |
|---|---|---|---|
| 0 | Rail | — | 3px + **icon** theo `health` (không chỉ màu — a11y guideline §9.3) |
| 1 | Checkbox | — | **Chỉ render khi kỳ có ≥1 action khả dụng** (§8.1) |
| 2 | Kỳ | left | `#1042` + `drawNo`, `font-medium tabular-nums` |
| 3 | Giờ quay | right | `14:07` + dòng dưới `−12p` (tương đối) |
| 4 | **Chặng** | left | Badge `stage` + hậu tố `health` (guideline §1.5) — **không** `status` thô |
| 5 | Trong chặng | right | `ageInStageSec` đã format; đỏ khi `stuck` |
| 6 | Doanh thu | right | `tabular-nums`; badge outlier `▲3.4×` |
| 7 | Vé / Bộ | right | 2 dòng trong 1 cột |
| 8 | Exposure | right | RAW + nhãn `(chưa cap)` (guideline §3.4) |
| 9 | Alerts | right | Badge `crit/warn`; 0 → `–` mờ |
| 10 | Actions | right | `Chi tiết ↗` (p1-03) + action đơn của dòng |

Bỏ cột `status` thô (đã gộp vào Chặng) — mỗi cột thêm là một cột phải đọc.

**Column def tách file** `_lib/sections/queue/columns-5a.tsx` (guideline §9). Cột đầu `pl-5`, cột cuối
`pr-5` (`frontend-dev.mdc` §1.7a — bắt buộc khi table trong `CardContent p-0`).

### 7.1 Checkbox — 3 trạng thái + `stopPropagation`

Header checkbox: unchecked / **indeterminate** (chọn một phần) / checked. Dùng `Checkbox` shadcn với
`checked={"indeterminate"}`. Không bỏ qua indeterminate — nó cho staff biết "đang chọn một phần" mà
không phải đếm.

`onClick` checkbox **phải** `stopPropagation()`: không có nó, click checkbox cũng trigger row click
(inline expand — p1-03).

### 7.2 Tô màu dòng — tối đa 1 màu, không zebra

```tsx
// Chỉ MỘT màu mỗi dòng. Nhiều màu chồng nhau làm mất khả năng quét cột dọc — mục đích duy
// nhất của bảng này. Ưu tiên: destructive > amber > không màu.
// Nền RẤT nhạt (/5): điểm nhấn ở rail + icon + badge, không ở nền. Nền đậm với 112 dòng đỏ
// = cả trang đỏ = mất hết ý nghĩa "nổi bật".
function getRowAccent(row: DerivedRow): RowAccent {
  if (row.health === StageHealth.Stuck
    || row.stage === OpsStage.NeedsResettle
    || row.stage === OpsStage.NeverOpened) {
    return "destructive";   // bg-destructive/5
  }
  if (row.health === StageHealth.Warn
    || row.gate === SaleGate.PendingOpen
    || row.gate === SaleGate.Halted) {
    return "warn";          // bg-amber-500/5
  }
  return "none";
}
```

`alertsCritical > 0` **không** tự tô đỏ dòng — nó đã đẩy kỳ vào tab `Cần xử lý` (§4.1) và có badge ở
cột 9. Tô thêm là màu thứ hai chồng lên.

**Không zebra striping** (`operations-page-ui.mdc`).

## 8. Bulk Action Bar — 4 action

`sticky bottom-0`, hiện khi `validSelection.size > 0`.

### 8.1 Tính khả dụng theo trạng thái — điểm quan trọng nhất

```tsx
/**
 * Phân loại kỳ đã chọn theo khả năng thực hiện TỪNG action.
 *
 * Nút PHẢI disable khi không kỳ nào đủ điều kiện, và PHẢI hiện đúng số kỳ SẼ bị tác động
 * (không phải tổng số đã chọn). Cho bấm rồi báo lỗi là thiết kế sai: staff mất 1 vòng
 * request để biết điều mà UI đã biết trước.
 */
function partitionByAction(selected: DerivedRow[], nowMs: number): {
  /** `stage = AwaitingSettle` hoặc `NeedsResettle` → kết sổ được. */
  settlable: string[];
  /** `isVoidable(status)` — import từ package, KHÔNG tự liệt kê. */
  voidable: string[];
  /** `stage = PendingClose` (status `salesOpen`, đã qua `closeAt`) → chốt sổ được. */
  closable: string[];
  /** `gate ∈ {PendingOpen, Halted}` VÀ `nowMs < closeAt` → mở bán được. */
  openable: string[];
};
```

Bốn ràng buộc **đã verify trong code**, không được đoán lại:

1. **`isVoidable(status)` import từ `game-keno-application`** (p0-04 §6 export nó). FE **không** hardcode
   danh sách. Checklist grep chặn việc tự liệt kê.
2. **`DrawStatus.SalesOpen` KHÔNG voidable** → kỳ `PendingClose` **không** void trực tiếp được. UI phải
   nói rõ: tooltip `"Chốt sổ bán trước khi huỷ"` + nút dẫn sang `Chốt sổ`. Không để staff bấm Void rồi
   nhận `DRAW_INVALID_TRANSITION` không hiểu vì sao.
3. **`NeverOpened` chỉ VOID được**, không chốt sổ: `CloseSalesUseCase` filter `status = salesOpen`, kỳ
   `scheduled` không khớp → `DRAW_INVALID_TRANSITION`. Đây chính là lý do guideline tách `NeverOpened`
   khỏi `PendingClose` — cho 2 thứ cùng badge = mời staff bấm nút chắc chắn lỗi.
4. **`openable` phải kiểm `nowMs < closeAt`**: `OpenSalesUseCase` **không** tự kiểm (p0-04 §2.4). Kỳ đã
   qua `closeAt` mà hiện nút "Mở bán" là mời bấm một nút mở cược cho kỳ đã có kết quả.

Nút hiện:
- `n > 0` → `"Kết sổ {n} kỳ"`, enable.
- `n === 0` → disable + tooltip nói **vì sao** (`"Không kỳ nào ở chặng Chờ kết sổ"`).
- `n < selected.length` → dòng phụ `"{d} kỳ không đủ điều kiện"`.

**Kèm tổng tiền** trên nút chọn-tất-cả: `Chọn 14 kỳ · 284.6 tr` (guideline §5.6). Action tiền không
được để người bấm đoán quy mô.

### 8.2 `toggleSelectAllVisible` — theo `rows5A` đã filter

Chọn theo **bảng đang thấy sau filter**, không phải toàn bộ `rows`. Staff filter `Chờ kết sổ` rồi bấm
select-all thì phải chọn đúng những kỳ đang thấy. Chọn cả kỳ bị filter ẩn là hành vi bất ngờ với hành
động tác động tiền.

Và chỉ chọn kỳ **có ít nhất 1 action khả dụng** (§8.1) — chọn kỳ `Settling` (đang chạy) là rác trong
selection.

### 8.3 Trần chọn

`validSelection.size > BULK_MAX_DRAWS` (50, **import** từ `bulk-limits.ts` của p0-04) → disable mọi nút
+ cảnh báo `"Chọn tối đa 50 kỳ mỗi lần"`. **Không** để submit rồi nhận 400 từ Zod.

Import hằng số, **không** viết `50` ở FE — một nguồn duy nhất (p0-04 §2.2).

### 8.4 Confirm dialog (guideline §5.6)

- **Tổng doanh thu tập đã chọn ở đầu, cỡ lớn.** Đây là thứ chặn được cú click sai 112 kỳ.
- **Liệt kê từng `drawId`** (scroll khi dài), `font-mono text-xs`. Không chỉ đếm.
- Void: bắt buộc `reason` (`min 1`, `max 500` — khớp Zod p0-04). Dùng react-hook-form + zodResolver
  (`frontend-dev.mdc` §5b — form có mutation bắt buộc stack này).
- Dialog header có icon gradient theo màu game (`frontend-dev.mdc` §5b.4).
- Nút xác nhận `variant="destructive"` cho void.
- **`close-sales`/`open-sales` cũng cần confirm** nhưng nhẹ hơn (không cần `reason`): chúng đổi khả
  năng nhận cược của kỳ, tức là chạm doanh thu.

### 8.5 Xử lý kết quả — partial success

```tsx
onSuccess: (data) => {
  // Kỳ thành công: bỏ khỏi selection. Kỳ lỗi: GIỮ lại + gắn lỗi để staff thấy tại dòng đó.
  // KHÔNG clear toàn bộ selection — staff sẽ mất dấu kỳ nào lỗi giữa 50 kỳ.
  const failed = data.results.filter((r) => !r.ok);
  setSelectedIds(new Set(failed.map((r) => r.drawId)));
  setRowErrors(new Map(failed.map((r) => [r.drawId, r.errorMessage ?? r.errorCode ?? "Lỗi"])));

  // KHÔNG toast "thành công" khi có kỳ lỗi — toast xanh khi 3/10 kỳ lỗi là BÁO SAI.
  if (failed.length === 0) {
    toast.success(`Đã kết sổ ${data.successCount} kỳ.`);
  } else {
    toast.warning(`${data.successCount} thành công, ${failed.length} lỗi.`);
  }

  void queryClient.invalidateQueries({ queryKey: kenoKeys.opsHub() });
},
```

Route p0-04 luôn trả **`200`** kể cả khi toàn bộ kỳ lỗi → **không** có nhánh `onError` cho lỗi nghiệp
vụ; `onError` chỉ dành cho lỗi mạng/auth. Đọc `successCount`/`failureCount` trong `onSuccess`.

`rowErrors: Map<drawId, string>` ở context, hiện badge lỗi tại dòng. Xoá khi staff bỏ chọn kỳ đó hoặc
kỳ rời `rows`.

**`mutation.isPending`** disable mọi nút + spinner. Không `useState` riêng
(`vercel-react-best-practices` §6.9).

**Không** `biome-ignore` cho `noFloatingPromises` ở đây — đây là code chạm tiền (`settle`, `void`), cấm
tuyệt đối theo `biome-lint-conventions.mdc` §d. Dùng `void` tường minh hoặc `await`.

## 9. Focus Rail (tầng 3 của guideline §1.4.6) — làm ở plan này

p1-01 làm Overview + Stepper. Rail làm ở đây vì nó **click để focus dòng bảng** — cần bảng tồn tại.

1. **11 card = 5 trước · biên · 5 sau.** Brush đổi được độ rộng, **giới hạn 7–21 card**. Dưới 7 mất ngữ
   cảnh; trên 21 chữ nhỏ hơn ngưỡng đọc.
2. **Vạch `║` đôi ở biên chốt cược** — dày hơn mọi đường khác trên trang.
3. Mỗi card: `drawNo` · giờ quay · badge chặng+health · doanh thu · mini bar.
4. **Đường median ngang xuyên rail**, tính **trong cùng gate** (guideline §9.2) — kỳ mới mở bán 2 phút
   không so được với kỳ đã bán 8 tiếng.
5. Click card → **scroll + highlight 2s** dòng tương ứng ở 5A **hoặc** 5B (tuỳ gate). **KHÔNG filter
   bảng** (guideline §1.4.10): backlog có thể rải rác 8 giờ; rail filter bảng sẽ **ẩn mất đúng kỳ đang
   treo** — biến công cụ điều hướng thành công cụ che thông tin.
6. Card `health ≠ ok` → viền đỏ/amber.
7. Nếu dòng đích nằm ở tab đang bị ẩn → **đổi tab rồi mới scroll** (không im lặng không làm gì).

`scrollIntoView({ block: "center" })` + class highlight tự xoá sau 2s bằng `setTimeout` + ref.
**Không** setState cho highlight (nó là hiệu ứng thị giác, không phải dữ liệu).

## 10. Bàn phím (guideline §10)

| Key | Hành động |
|---|---|
| `j` / `k` | Xuống / lên dòng (5A) |
| `x` | Toggle chọn dòng đang focus |
| `Enter` | Mở chi tiết ở tab mới (p1-03) |
| `1`–`5` | Nhảy tab chặng 5A |
| `←`/`→`, `Shift+←/→`, `Home`/`End`, `c` | Điều hướng rail (p1-01 §1.4.8) |
| `r` | Refetch ngay |
| `?` | Bảng phím tắt |

**1 listener duy nhất ở cấp trang** (`vercel-react-best-practices` §4.1), không mỗi dòng/card một
listener. Dòng đang focus giữ ở `useRef` + attribute DOM, không state (di chuyển `j`/`k` qua 200 dòng
với setState = 200 re-render).

**Bỏ qua khi focus đang ở `input`/`textarea`** (ô search 5B, ô `reason` dialog) — nếu không, gõ chữ `r`
trong ô lý do sẽ refetch.

## 11. Test

### 11.1 Selection — nhóm quan trọng nhất, KHÔNG skip

| Case | Kỳ vọng |
|---|---|
| Chọn 3 kỳ, refetch (thứ tự `rows` đổi) | **Vẫn đúng 3 kỳ đó**, không trỏ sai |
| Chọn 3 kỳ, 1 kỳ settle xong rời `rows` | Selection còn 2, số trên nút = 2 |
| Filter `Chờ kết sổ` rồi select-all | Chỉ chọn kỳ đang thấy, **không** kỳ bị ẩn |
| Select-all khi có kỳ `Settling` trong danh sách | Kỳ `Settling` **không** được chọn |
| Chọn một phần | Header checkbox `indeterminate` |
| Click checkbox | **Không** trigger row expand (`stopPropagation`) |
| Click dòng | Expand, **không** đổi selection |
| F5 giữa lúc đang chọn | Selection **rỗng** (không persist), filter **giữ** (URL) |

Case 1-2 là lý do tồn tại của quyết định §3 — **bắt buộc test**.

### 11.2 Tính khả dụng action — nơi dễ sai nhất

| Chọn | `settlable` | `voidable` | `closable` | `openable` |
|---|---|---|---|---|
| Kỳ `AwaitingSettle` (`published`) | ✅ | ✅ | ❌ | ❌ |
| Kỳ `PendingClose` (`salesOpen` qua `closeAt`) | ❌ | **❌** | ✅ | ❌ |
| Kỳ `NeverOpened` (`scheduled` qua `closeAt`) | ❌ | ✅ | **❌** | **❌** |
| Kỳ `PendingOpen`, `now < closeAt` | ❌ | ✅ | ❌ | ✅ |
| Kỳ `Halted` (`salesClosed`), `now < closeAt` | ❌ | ✅ | ❌ | ✅ |
| Kỳ `Halted` (`voiding`) | ❌ | ❌ | ❌ | ❌ |
| Kỳ `Settling` | ❌ | ❌ | ❌ | ❌ |
| Kỳ `NeedsResettle` | ✅ | ✅ | ❌ | ❌ |

Bốn ô in đậm là các constraint đã verify trong code (§8.1) — sai ô nào là một nút mời-bấm-để-lỗi.

| Case | Kỳ vọng |
|---|---|
| Chọn toàn kỳ `Selling` (không thể — 5B không có checkbox) | 5B **không render** checkbox nào |
| Chọn 10 kỳ (7 settlable, 3 không) | Nút `"Kết sổ 7 kỳ"` + `"3 kỳ không đủ điều kiện"` |
| Chọn toàn `PendingClose`, bấm Void | Nút **disable** + tooltip `"Chốt sổ bán trước khi huỷ"` |
| Chọn 51 kỳ | Mọi nút disable + cảnh báo trần |
| Chọn kỳ `PendingOpen` đã qua `closeAt` | Nút `Mở bán` **disable** (§8.1 điểm 4) |
| Confirm dialog | Hiện **tổng doanh thu** cỡ lớn + liệt kê **từng** `drawId` |
| Void không nhập `reason` | Submit disable |
| Kết quả 7 ok / 3 lỗi | Selection còn 3 kỳ lỗi, badge lỗi tại dòng, toast **warning** |
| Kết quả 0 ok / 10 lỗi (HTTP 200) | Vào `onSuccess`, toast warning, **không** treo ở `onError` |
| Kết quả toàn ok | Selection rỗng, toast success |
| Đang chạy | Mọi nút disable, spinner |

### 11.3 Hiệu năng — đo, không suy luận

| Đo | Ngưỡng |
|---|---|
| Số request khi đổi tab/sort | **0** (client-side) |
| Số request khi toggle selection | **0** |
| Re-render khi tick 1 checkbox | **Chỉ dòng đó + action bar**, không cả bảng |
| Re-render khi chữ số `Trong chặng` nhích | **0** (ghi DOM qua ref) |
| Re-render/phút khi idle | ≤ 2 (kế thừa p1-01 §5.3) |
| Render 5A với 300 dòng (Profiler) | Ghi số vào PR; > 100ms → xét virtualization |
| 5B Lớp 3 đóng | **0** dòng trong DOM (không `hidden`) |
| 5B Lớp 3 mở với 150 kỳ | Ghi số render vào PR |
| `j` × 50 lần liên tiếp | **0** re-render bảng (focus qua ref) |
| Số `setInterval` đang chạy | **1** (dùng chung) |

Dòng "re-render khi tick checkbox" là test cho §6.2. Nếu cả bảng re-render → `memo` chưa nhận primitive
hoặc `onToggle` chưa stable.

## 12. Review checklist

- [ ] **2 bảng tách biệt** theo `gate`, không 1 bảng có filter.
- [ ] 5B **không** render checkbox; Lớp 3 mặc định đóng và **không mount** khi đóng.
- [ ] 5B Lớp 3 có ô **search**; không phải chỉ cuộn.
- [ ] Selection là `Set<drawId>`; grep `rowSelection` trong `operations-hub/` = **0 match**.
- [ ] `validSelection` tính **derived** trong render, **không** `useEffect` + `setState`.
- [ ] `toggleSelectAllVisible` theo `rows5A` **đã filter**, và chỉ kỳ có action khả dụng.
- [ ] `setState` dạng functional; `useCallback` không dependency.
- [ ] **`toSorted()`** không `sort()`; deps của `useMemo` filter/sort **không** chứa `selectedIds`.
- [ ] Row `memo` theo **primitive**; không default value non-primitive trong props.
- [ ] `content-visibility: auto` + `contain-intrinsic-size`; **không** thêm `react-virtual`.
- [ ] `health` sort bằng **rank số**, không so string.
- [ ] Filter/sort/focus vào URL qua nuqs `history:"replace"` + `clearOnDefault`.
- [ ] Selection **không** persist, **không** vào URL.
- [ ] **`isVoidable()` import** từ package. Grep: `rg -n 'sales_open|SalesOpen' apps/backoffice/src/app/\(main\)/games/keno/operations-hub` — không chỗ nào tự liệt kê trạng thái void được.
- [ ] `BULK_MAX_DRAWS` **import** từ `bulk-limits.ts`; không viết `50` ở FE.
- [ ] `openable` kiểm `now < closeAt`; `closable` chỉ `PendingClose`; `NeverOpened` chỉ void.
- [ ] Kỳ `PendingClose` bấm Void → disable + tooltip dẫn sang `Chốt sổ`.
- [ ] Nút bulk hiện **đúng số kỳ tác động** + **tổng tiền**.
- [ ] Confirm liệt kê **từng** `drawId` + tổng doanh thu cỡ lớn; void bắt buộc `reason`; react-hook-form + zodResolver.
- [ ] Kỳ lỗi **giữ** trong selection + badge lỗi tại dòng; toast **warning** khi có lỗi.
- [ ] Lỗi nghiệp vụ xử ở **`onSuccess`** (route trả 200), `onError` chỉ cho mạng/auth.
- [ ] **Không** `biome-ignore` `noFloatingPromises` (code tài chính).
- [ ] Badge hiện `stage` + hậu tố `health`, **không** `status` thô. Không cột `status`.
- [ ] Tối đa **1 màu**/dòng; không zebra; nền `/5`.
- [ ] Mọi màu **kèm icon** ở cột rail.
- [ ] `pl-5`/`pr-5` cột đầu/cuối; `tabular-nums` mọi cột số; exposure có nhãn `(chưa cap)`.
- [ ] **5 tab**, không tab `Đã xong`; empty state mang thông tin.
- [ ] Sort mặc định `health → ageInStage`, **không** `drawId` desc.
- [ ] Rail **không filter** bảng, chỉ scroll+highlight; đổi tab nếu dòng đích bị ẩn.
- [ ] 1 keyboard listener cấp trang; bỏ qua khi focus ở `input`/`textarea`.
- [ ] Đã đo render 300 dòng + re-render/phút, dán số vào PR.
- [ ] `pnpm check-types` + `pnpm lint` xanh.

## 13. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| **Selection trỏ sai kỳ sau refetch → settle/void nhầm** | 🔴 | `Set<drawId>` §3 + test §11.1 case 1-2. Rủi ro nghiêm trọng nhất cả P1 |
| **Select-all chọn cả kỳ bị filter ẩn** | 🔴 | §8.2 + test |
| Staff void nhầm hàng loạt | 🔴 | Confirm liệt kê từng kỳ + tổng tiền cỡ lớn + `reason` + `destructive` |
| Persist selection → kết sổ tập kỳ không ai chọn | 🔴 | §5.2 cấm tuyệt đối + test F5 |
| Nút Void cho kỳ `PendingClose` → staff nhận lỗi không hiểu | 🟡 | §8.1 điểm 2 + tooltip dẫn hướng + test §11.2 |
| Nút Mở bán cho kỳ đã qua `closeAt` | 🟡 | §8.1 điểm 4 (`OpenSalesUseCase` không tự kiểm) |
| FE tự liệt kê `VOIDABLE_STATUSES` rồi lệch với backend | 🟡 | Import `isVoidable()` + grep checklist |
| Toast xanh khi có kỳ lỗi | 🟡 | §8.5 + test |
| Cả bảng re-render mỗi tick checkbox | 🟡 | `memo` primitive + callback stable + test §11.3 |
| 5B render 150 dòng làm chìm 5A | 🟡 | Tách bảng + Lớp 3 đóng, không mount |
| `sort()` mutate React Query cache | 🟡 | `toSorted()` + checklist |
| Sort nhảy thứ tự dưới tay người dùng | 🟢 | Sort đổi tại boundary tick, không mỗi giây (§6.4) |
| `j`/`k` qua 200 dòng gây bão render | 🟢 | Focus qua ref + attribute DOM |
| Rail filter bảng làm ẩn kỳ đang treo | 🟢 | §9 điểm 5 cấm, chỉ scroll+highlight |

## 14. Rollback

Revert commit. Zone 1–4 (p1-01) vẫn chạy: header, phễu, Day Flow Overview+Stepper, banner. Mất khả năng
thao tác theo lô — staff dùng trang Operations 1 kỳ như trước.

Không có state server-side cần dọn: selection chỉ ở memory client; filter ở URL (F5 là hết). Backend
bulk API (p0-04) không bị chạm — nó có thể tồn tại mà không có UI.