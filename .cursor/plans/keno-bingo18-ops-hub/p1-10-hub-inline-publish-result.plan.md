# p1-10 — Nhập kết quả ngay trong Ops Hub (không cần mở tab `operations`)

> **Phase:** P1 · **Status:** ✅ code done + fix 3 bug thật: "dialog tự tắt khi bấm Xác nhận & Kỳ tiếp" + "kỳ tiếp nhảy về kỳ CŨ HƠN" (2 lượt, 09/09) · **Phụ thuộc:** p1-06 (done), p1-09 (done)
>
> **BUG THẬT đã gặp và sửa (09/09, test UI thật):** Bản đầu mount `PublishResultAction` ngay
> trong `HubExpandPanel`, gate bằng `row.status === SalesClosed`. Khi staff bấm "Xác nhận & Kỳ
> tiếp": mutation thành công → Hub refetch → `row.status` đổi `SalesClosed → Published` → kỳ
> rời khỏi `rows5A` của tab đang chọn → effect tự-đóng-panel có sẵn ở `hub-queue-table.tsx`
> (dòng ~182, viết cho mục đích khác — đóng panel khi kỳ rời tab) set `expandedDrawId = null` →
> `HubExpandPanel` UNMOUNT HOÀN TOÀN → dialog (đang mở, đang giữ hàng đợi qua `completedDrawIds`
> nội bộ) biến mất theo, staff thấy "bấm Xác nhận, dialog tự tắt" dù mutation vẫn thành công.
> Đã sửa: chuyển `PublishResultAction` + state `publishOpen`/`publishAnchorId` + tính
> `publishQueue` lên mount ở `HubQueueTable` (component cha, không phụ thuộc trạng thái/tab của
> 1 dòng cụ thể) — `HubExpandPanel` chỉ còn gọi `onOpenPublish(row.drawId)`. Dialog giờ sống sót
> qua mọi lần refetch/đổi trạng thái giữa các kỳ trong hàng đợi. Chi tiết kỹ thuật xem JSDoc
> `onOpenPublish` trong `hub-expand-panel.tsx` và JSDoc trên `publishOpen` trong
> `hub-queue-table.tsx`.
> **BUG THẬT #2 đã gặp và sửa (09/09, báo bởi user kèm ảnh chụp UI thật):** Hàng đợi "Xác nhận &
> Kỳ tiếp" ghép `[anchor, ...pending.filter(d => d.drawId !== anchor.drawId)]` — TOÀN BỘ kỳ
> `SalesClosed` khác **kể cả kỳ CŨ HƠN** kỳ đang chọn theo `drawId`. Staff mở kỳ `#006` (không
> phải kỳ tồn đọng sớm nhất trong danh sách — còn `#002 #003 #004 #005` tồn đọng từ trước) → bấm
> "Xác nhận & Kỳ tiếp" thì dialog nhảy sang `#002` (CŨ HƠN `#006`) thay vì `#007` (kỳ liền kề
> ĐÚNG THEO THỜI GIAN của `#006`) — đúng như user phản hồi: *"Xác nhận và ký tiếp là kỳ nối tiếp
> sau kỳ hiện tại"*. Nguyên nhân gốc: logic này COPY 1:1 từ `pendingResultQueue` ở trang
> `operations` (p1-06) — cùng lỗi tồn tại ở CẢ BA nơi dùng chung pattern (Keno `operations`,
> Keno Hub, Bingo18 `operations`). Đã sửa cả 3: hàng đợi **CHỈ** gồm kỳ đang chọn + các kỳ
> **ĐỨNG SAU** nó theo `drawId` (`after = pending.filter(d => d.drawId > anchor.drawId)`) — kỳ cũ
> hơn (backlog tồn từ trước) **KHÔNG** vào hàng đợi "nhập liên tiếp" của phiên này; staff muốn xử
> lý kỳ cũ đó thì bấm nút đúng ngay dòng đó (mở hàng đợi riêng, anchor = kỳ cũ đó). Xem JSDoc trên
> `publishQueue` (`hub-queue-table.tsx`) và `pendingResultQueue` (2 file `operations/index.tsx`).
>
> **Scope:** CHỈ Keno (`apps/backoffice/.../keno/operations-hub/`) — Bingo18 **CHƯA có** trang Hub
> (đang `p1-04`, pending), nên áp dụng đợt này khi port. Xem §7.

> **BUG THẬT #3 đã gặp và sửa (09/09, báo bởi user — CHỈ ở Hub, không có ở trang `operations`):**
> Sau khi fix bug #2 (kỳ tiếp nhảy về kỳ cũ hơn), user báo tiếp: chọn `#005`, panel hiển thị
> ĐÚNG "Còn 3 kỳ chưa có KQ: #007 · #008 · #009", nhưng bấm "Xác nhận & Kỳ tiếp" ngay sau khi
> `#005` submit xong thì lại nhảy về `#002` (backlog cũ) — KHÔNG phải `#007` như panel đã báo
> trước. Nguyên nhân: `publishQueue` ở `hub-queue-table.tsx` tìm `anchorRow` **trong `pending`**
> (mảng đã lọc CHỈ còn status `SalesClosed`). Ngay khi `#005` submit thành công → Hub refetch →
> CHÍNH `#005` (đang là anchor suốt cả phiên hàng đợi, `publishAnchorId` không đổi vì Hub không
> điều hướng URL như trang `operations`) đổi status khỏi `SalesClosed` → `pending.find(anchor)`
> không còn thấy `#005` → rơi vào nhánh fallback `return pending` (không lọc theo anchor nữa) →
> kéo lại backlog `#002...`. Trang `operations` KHÔNG có bug này vì `onNext` cập nhật `draw`
> context sang đúng kỳ mới mỗi lần submit — không dựa vào 1 "anchor" cố định suốt phiên như Hub.
> Đã sửa: tìm mốc `drawId` của anchor trong **`state.rows` (TOÀN BỘ, không giới hạn
> `SalesClosed`)** — anchor vẫn tồn tại trong `rows` dù status đã đổi, chỉ mất khỏi `pending`.
> Nếu anchor đã hết `SalesClosed` (vừa xử lý xong) → hàng đợi bắt đầu thẳng từ "sau anchor",
> không tự thêm lại anchor. Xem JSDoc đầy đủ trên `publishQueue`.
> **Không phụ thuộc thời gian chờ nào** — đây là bổ sung UX cho Hub đã production, không phải
> tính năng mới rủi ro cao (dùng lại 100% mutation/hook đã chạy thật từ p1-06).

## 0. Vấn đề — vì sao cần

Hub hiện tại, khi kỳ ở trạng thái `SalesClosed` ("Chưa có KQ"), nút hành động chính trong
`HubExpandPanel` là **điều hướng** — mở tab mới sang trang `/games/keno/operations?drawId=...`
(xem comment `hub-expand-panel.tsx` dòng 436-442, nhánh `nextAction && !bulkKind`). Đây là **quyết
định cố ý từ p1-08 §6** (trước đó nút còn tệ hơn — "biến mất" hoàn toàn ở case này), nhưng vẫn
buộc staff rời khỏi màn hình giám sát nhiều kỳ mỗi khi cần nhập kết quả — đúng lúc Hub tồn tại để
**không** phải làm vậy.

`p1-06` đã xây xong luồng "Xác nhận & Kỳ tiếp ▶" (dialog nhập liên tiếp nhiều kỳ không cần đóng
mở lại) — nhưng **chỉ lắp vào trang `operations`** (1 kỳ/lần, xem qua `useDrawContext().draws`).
Plan này lắp **chính dialog đó** (0 code mới cho phần nhập số/validate/submit) trực tiếp vào
`HubExpandPanel`, để staff nhập kết quả — kể cả nhiều kỳ liên tiếp — **không rời trang Hub**.

## 1. Quyết định thiết kế đã chốt (đọc code xác nhận, không suy đoán)

| # | Câu hỏi | Kết luận | Bằng chứng |
|---|---|---|---|
| 1 | Có cần di chuyển file `publish-result-action.tsx` sang thư mục chia sẻ? | **KHÔNG.** Import trực tiếp từ `keno/operations/_lib/...` vào `operations-hub/_lib/...` **đã có tiền lệ** trong chính codebase | `hub-page-header.tsx:21` đã import `CreateDrawAction` từ `@/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions` |
| 2 | Hub cần gọi thêm hook nào (`usePublishResult`, `useVietlottSuggestion`,...)? | **KHÔNG.** Cả 3 hook đó được gọi **NỘI BỘ trong** `PublishResultAction` — caller (`draw-management/index.tsx` ở trang `operations`) không import chúng, chỉ import component + type | Đọc `draw-management/index.tsx:36-41`: chỉ import `PublishResultAction`, `PublishResultCurrentValues` từ `./draw-actions` |
| 3 | Query cache có tự cập nhật Hub sau khi publish? | **CÓ, tự động, 0 code thêm.** `usePublishResult` → `useDrawAction` → `invalidateQueries({queryKey: kenoKeys.all})`; `kenoKeys.opsHub()` là `[MODULE, "ops-hub"]`, con của `kenoKeys.all = [MODULE]` → bị invalidate theo (React Query mặc định `exact: false`) | `use-operations.ts:349` + `query-keys/keno.ts:8,44` |
| 4 | `PublishResultDraw` (`{drawId, scheduledDrawAt, drawTime}`) map từ `DerivedRow` (Hub) thế nào? | **`drawTime` LỆCH FORMAT — phải convert, không gán thẳng.** `DrawSelectorItem.drawTime` (trang `operations`) là chuỗi đã format `"HH:mm"`; `OpsHubDrawRow.drawTime` (Hub) là **ISO 8601 đầy đủ**. Gán thẳng sẽ làm tiêu đề dialog hiện nguyên chuỗi ISO thay vì `"20:59"` | `draw-selector.dto.ts:19` (`drawTime: string`, comment "Giờ quay, format HH:mm") vs `hub-snapshot.dto.ts:23` (`drawTime: string`, comment "ISO 8601"); dùng nơi duy nhất ở `formatResultDialogTitle(id, drawTime)` — nội suy thẳng vào chuỗi, không tự format lại (`result-dialog-title.ts:10`) |
| 5 | Case nào thực sự cần dialog này? | **CHỈ `DrawStatus.SalesClosed`.** `Published` (kể cả chưa `isResettleReady`) đã có `bulkKindForStatus` trả `Settle` → luôn đi nhánh mutation-bulk, KHÔNG rơi vào nhánh nav/dialog | `hub-expand-panel.tsx` `bulkKindForStatus` (dòng 119-128) + `draw-next-action.ts` dòng 65-80 (`Published` luôn trả label "Kết sổ"/"Kết sổ lại", không có case nào khác rơi vào nhánh `nextAction && !bulkKind`) |
| 6 | Có cần `currentResult` (prefill sửa kết quả) như trang `operations`? | **KHÔNG.** Case `SalesClosed` là nhập kết quả **LẦN ĐẦU** — không có kết quả cũ để prefill. Sửa kết quả (republish) là flow khác, ở status `Published`/`Settled`, không thuộc case nav này (câu 5) | Đối chiếu luồng ở trang `operations`: `currentResult` chỉ có giá trị khi `RESULT_SHOW.has(draw.status)` (`Published`/`Settling`/`Settled`) — không giao với `SalesClosed` |
| 7 | Hàng đợi "Chưa có KQ" build từ đâu? | Từ `useHubContext().state.rows` — **toàn bộ rows chưa hoàn thành**, KHÔNG phải `rows5A` (đã lọc theo tab đang chọn) | `use-hub-context.tsx` — `state.rows = derived.rows` (dòng 290, mọi dòng); `state.rows5A` đã qua `buildQueueTables` theo `activeTab` (dòng 220-224) — dùng nhầm sẽ làm hàng đợi thiếu kỳ khi staff đang xem tab khác |
| 8 | Lỗi `slice(idx)` bỏ sót kỳ tồn ngày trước (bug thật p1-06 đã fix) có lặp lại ở Hub không? | **Rủi ro giống hệt, phải áp lại đúng fix cũ** — Hub cũng có kỳ vắt nhiều ngày (`listUnfinishedDrawRows` không lọc theo ngày) | `p0-03-hub-query-foundation.plan.md` — Hub query không giới hạn 1 ngày, giống hệt điều kiện gây bug ở p1-06 |

## 2. Thiết kế — đúng 3 thay đổi, không thêm gì khác

### 2.1 Export thêm 1 type (barrel hiện thiếu)

`draw-actions/index.ts` (`keno/operations/_lib/sections/draw-management/draw-actions/index.ts`)
hiện **chỉ** export `PublishResultAction` + `PublishResultCurrentValues` — **thiếu**
`PublishResultDraw` (type Hub cần để build `draw`/`queue` prop):

```typescript
export type { PublishResultCurrentValues } from "./publish-result-action";
export type { PublishResultDraw } from "./publish-result-action"; // ← THÊM
export { PublishResultAction } from "./publish-result-action";
```

### 2.2 Hàm map `DerivedRow` → `PublishResultDraw` (file mới, nhỏ)

Đặt trong `operations-hub/_lib/sections/queue/` (cạnh `hub-expand-panel.tsx`, không phải file
riêng nếu chỉ 1 hàm ngắn — cân nhắc inline thẳng trong `hub-expand-panel.tsx` nếu không nơi khác
cần dùng lại). Tên gợi ý: `toPublishResultDraw`.

```typescript
import { displayVNTime } from "@megawin/shared/utils";
import type { PublishResultDraw } from "@/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions";
import type { DerivedRow } from "../../hub-types";

/**
 * Map 1 dòng Hub sang field tối thiểu `PublishResultAction` cần.
 *
 * `drawTime` PHẢI convert qua `displayVNTime` — `DerivedRow.drawTime` là ISO 8601 đầy đủ (nguồn
 * Hub snapshot), còn `PublishResultDraw.drawTime` kỳ vọng chuỗi đã format `"HH:mm"` (nguồn gốc:
 * `DrawSelectorItem` của trang `operations`). Gán thẳng ISO vào đây làm tiêu đề dialog hiện
 * nguyên chuỗi ISO thay vì giờ ngắn gọn — xem plan p1-10 §1 câu 4.
 */
export function toPublishResultDraw(row: DerivedRow): PublishResultDraw {
  return {
    drawId: row.drawId,
    scheduledDrawAt: row.drawTime, // cùng ngữ nghĩa (DrawDoc.drawTime dạng ISO) — gán thẳng được
    drawTime: displayVNTime(row.drawTime),
  };
}
```

### 2.3 Sửa `hub-expand-panel.tsx` — thêm state + queue + render

> **⚠️ CẬP NHẬT SAU FIX BUG (09/09, test UI thật):** Thiết kế gốc dưới đây (mount
> `PublishResultAction` + state `publishOpen` + `useMemo publishQueue` NGAY TRONG
> `HubExpandPanel`) đã **KHÔNG** được dùng trong code cuối — gây bug "bấm Xác nhận & Kỳ tiếp,
> dialog tự tắt" (xem hộp bug ở đầu file plan này). Code thật đã chuyển toàn bộ 3 thứ đó (state,
> `useMemo`, mount `<PublishResultAction>`) lên **`hub-queue-table.tsx`** — `HubExpandPanel` chỉ
> giữ lại đúng 1 thay đổi: nút bấm gọi `onOpenPublish(row.drawId)` (prop mới, callback từ cha)
> thay vì `setPublishOpen(true)` cục bộ. Nội dung §2.3 dưới đây **giữ lại làm tài liệu lịch sử**
> (giải thích logic build hàng đợi vẫn đúng, chỉ đổi NƠI SỐNG) — xem §2.4 cho vị trí thật.

**Import thêm** (gộp vào khối import đầu file, theo `code-quality-standards.mdc` §7):

```typescript
import { displayVNTime, formatMoneyCompact, formatNumberVN } from "@megawin/shared/utils"; // thêm displayVNTime
import { PublishResultAction, type PublishResultDraw } from "@/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions";
```

**State mới** (cạnh `openBulkDialog` hiện có, dòng ~254):

```typescript
const [publishOpen, setPublishOpen] = useState(false);
```

**Hàng đợi "Chưa có KQ"** — đọc `state.rows` (TOÀN BỘ, không phải `rows5A`, xem §1 câu 7), lọc
`SalesClosed`, sort `drawId` ASC, đặt kỳ đang mở panel lên đầu (fix ĐÚNG bug đã gặp ở p1-06 §1
câu 8 — KHÔNG dùng `slice(idx)`):

```typescript
const { state } = useHubContext(); // đổi từ `const { meta } = useHubContext();` thành lấy cả state

const publishQueue = useMemo(() => {
  const pending = state.rows
    .filter((r) => r.status === DrawStatus.SalesClosed)
    .toSorted((a, b) => a.drawId.localeCompare(b.drawId));
  const current = pending.find((r) => r.drawId === row.drawId);
  if (!current) {
    return undefined;
  }
  return [current, ...pending.filter((r) => r.drawId !== row.drawId)].map(toPublishResultDraw);
}, [state.rows, row.drawId]);
```

**Nhánh render** — đổi nhánh `nextAction && !bulkKind` (dòng 435-453 hiện tại): giữ Link nav làm
**fallback mặc định** (an toàn nếu tương lai có status khác rơi vào nhánh này ngoài dự kiến ở §1
câu 5), chỉ đổi thành Button mở dialog khi **đúng** `SalesClosed`:

```tsx
) : nextAction ? (
  row.status === DrawStatus.SalesClosed ? (
    // Nhập kết quả NGAY TRONG Hub (p1-10) — dialog tái dùng 100% từ trang `operations`
    // (p1-06), KHÔNG viết lại logic nhập/validate/submit. Escape hatch xem đủ ngữ cảnh
    // (financial/stats chi tiết) vẫn còn ở icon "Mở trang vận hành chi tiết" trên header panel.
    <Button
      size="sm"
      className={cn("gap-1.5 font-medium", nextAction.className)}
      onClick={() => setPublishOpen(true)}
    >
      <nextAction.icon className="size-3.5" /> {nextAction.label}
    </Button>
  ) : (
    // Fallback — status khác chưa có mutation/dialog riêng ở Hub, giữ nav như cũ.
    <Button asChild size="sm" className={cn("gap-1.5 font-medium", nextAction.className)}>
      <Link href={drawOperationsHref(GameProduct.Keno, row.drawId)} target="_blank" rel="noopener" prefetch={false}>
        <nextAction.icon className="size-3.5" /> {nextAction.label} <ExternalLink className="size-3" />
      </Link>
    </Button>
  )
) : (
```

**Mount dialog** — cạnh `BulkConfirmDialog` ở cuối component (sau `</TableCell>`, trong cùng
`<TableRow>` — giữ đúng vị trí tương tự bulk dialog hiện có):

```tsx
{row.status === DrawStatus.SalesClosed && publishQueue ? (
  <PublishResultAction
    draw={publishQueue[0]}
    disabled={false}
    open={publishOpen}
    onOpenChange={setPublishOpen}
    queue={publishQueue}
  />
) : null}
```

**Không truyền `onNext`** — Hub không có URL state "kỳ đang xem" như trang `operations`
(`onSelectDraw`). Dialog tự chuyển kỳ nội bộ qua `queue` (đúng cơ chế `completedDrawIds` đã có ở
`PublishResultAction`, xem p1-06) — staff nhập xong kỳ #1, dialog tự hiện kỳ #2 với tiêu đề/số đếm
đổi theo, **dù panel bên dưới vẫn đang hiện dữ liệu của kỳ #1** (chấp nhận được cho v1 — panel tự
cập nhật đúng ở lần mở lại sau khi đóng dialog, nhờ poll invalidate ở câu 3 §1). Không cố đồng bộ
"panel nào đang expand" theo dialog — việc đó cần thêm prop điều khiển từ `hub-queue-table.tsx`
(component cha), vượt phạm vi tối thiểu của plan này. Ghi lại là điểm để mở nếu staff phản hồi cần.

## 2.4 Kiến trúc THẬT sau fix bug — dialog mount ở `hub-queue-table.tsx`

`HubExpandPanel` bị component cha (`hub-queue-table.tsx`) UNMOUNT bất cứ khi nào dòng của nó
rời `rows5A` (tab filter) — effect có sẵn từ p1-03, ban đầu viết để đóng panel khi staff đổi
tab. Publish thành công đổi `row.status: SalesClosed → Published`, đúng lúc đó dòng rời khỏi
`rows5A` của tab "Chờ có KQ" → panel unmount → dialog (nếu sống trong panel) chết theo giữa
lúc đang chạy hàng đợi. Vì vậy dialog phải sống ở cấp không bị ảnh hưởng bởi trạng thái của
**1 dòng cụ thể**:

```typescript
// hub-queue-table.tsx — cạnh `expandedDrawId`, KHÔNG trong HubExpandPanel
const [publishOpen, setPublishOpen] = useState(false);
const [publishAnchorId, setPublishAnchorId] = useState<string | null>(null);

const handleOpenPublish = useCallback((drawId: string) => {
  setPublishAnchorId(drawId);
  setPublishOpen(true);
}, []);

const publishQueue = useMemo(() => {
  const pending = state.rows
    .filter((r) => r.status === DrawStatus.SalesClosed)
    .toSorted((a, b) => a.drawId.localeCompare(b.drawId));
  if (pending.length === 0) return undefined;
  if (publishAnchorId) {
    const anchor = pending.find((r) => r.drawId === publishAnchorId);
    if (anchor) {
      return [anchor, ...pending.filter((r) => r.drawId !== publishAnchorId)].map(toPublishResultDraw);
    }
  }
  return pending.map(toPublishResultDraw);
}, [state.rows, publishAnchorId]);
const firstQueuedDraw = publishQueue?.[0];
```

`HubExpandPanel` nhận thêm prop `onOpenPublish: (drawId: string) => void`, nút bấm gọi
`onOpenPublish(row.drawId)` — KHÔNG còn state/queue/dialog riêng. `<PublishResultAction>` mount
1 lần duy nhất, sibling với `<Table>` trong `<section>` của `HubQueueTable`, guard bằng
`firstQueuedDraw && publishQueue` (giữ nguyên style narrow-type §2.3 cũ).

## 3. Danh sách file thay đổi

| # | File | Thay đổi |
|---|---|---|
| 1 | `keno/operations/_lib/sections/draw-management/draw-actions/index.ts` | Thêm 1 dòng `export type { PublishResultDraw }` |
| 2 | `keno/operations-hub/_lib/sections/queue/hub-queue-table.tsx` | **(sau fix bug)** State `publishOpen`/`publishAnchorId`, `useMemo publishQueue`, `handleOpenPublish`, mount `<PublishResultAction>` — xem §2.4 |
| 3 | `keno/operations-hub/_lib/sections/queue/hub-expand-panel.tsx` | **(sau fix bug)** Thêm prop `onOpenPublish`, nút bấm gọi callback thay vì tự mở dialog cục bộ |
| 4 | `keno/operations-hub/_lib/sections/queue/to-publish-result-draw.ts` (file mới) | Hàm map thuần `toPublishResultDraw`, có JSDoc giải thích lý do convert `drawTime` (§2.2) |

**Không sửa** `publish-result-action.tsx` (Keno) — component đã đủ tổng quát từ p1-06 (nhận
`PublishResultDraw` hẹp, không phụ thuộc `DrawSelectorItem` đầy đủ). **Không sửa** bất kỳ file
Bingo18 — scope đợt này chỉ Keno (§7).

## 4. Cái KHÔNG được làm

1. **Không di chuyển/copy `publish-result-action.tsx` sang thư mục chia sẻ mới.** Đã xác nhận
   (§1 câu 1) import chéo route trong CÙNG game là pattern có tiền lệ (`hub-page-header.tsx`).
   Tạo thư mục chia sẻ mới cho 1 component chỉ dùng ở 2 route của **cùng 1 game** là over-engineer
   — khác hẳn `games/_lib/operations/` (chia sẻ **7 game**, có lý do tồn tại riêng).
2. **Không viết lại logic nhập/validate/submit kết quả.** Toàn bộ nghiệp vụ (20 số, validate
   trùng/range, paste, autofill Vietlott, mutation) giữ nguyên 100% trong
   `publish-result-action.tsx` — Hub chỉ thêm **nơi mount** + **dữ liệu truyền vào**.
3. **Không tự tính lại `pollSeconds`/tạo query riêng cho dialog.** Dialog dùng lại
   `useVietlottSuggestion`/`useVietlottResult` **nội bộ** của chính nó — Hub không cần biết, không
   cần truyền thêm prop nào cho 2 hook này.
4. **Không thêm field mới vào `OpsHubDrawRow`/DTO snapshot.** `drawId` + `drawTime` (đã có) là đủ
   để dựng `PublishResultDraw` — không cần query thêm field nào (giữ đúng ràng buộc "4 query cố
   định" của Hub, `00-overview.md` nguyên tắc #2).
5. **Không đồng bộ "panel nào đang expand" theo `queue` của dialog** (§2.3, quyết định v1). Nếu
   staff phản hồi cần — làm ở plan riêng, không âm thầm mở rộng scope plan này.
6. **Không gán thẳng `row.drawTime` (ISO) vào `PublishResultDraw.drawTime`** — bug im lặng đã
   xác định trước ở §1 câu 4 (tiêu đề dialog hiện chuỗi ISO thay vì `"HH:mm"`). Luôn qua
   `displayVNTime()`.
7. **Không dùng `state.rows5A` để build hàng đợi** (§1 câu 7) — bỏ sót kỳ `SalesClosed` ở tab
   khác đang được lọc ra.
8. **Không mount `<PublishResultAction>` (hay bất kỳ state/queue của nó) bên trong
   `HubExpandPanel`** — đây chính là bug thật đã xảy ra (xem hộp đầu file). `HubExpandPanel` bị
   component cha unmount bất cứ khi nào `row` rời `rows5A` (kể cả do publish thành công đổi
   status) — dialog sống trong đó sẽ chết theo giữa hàng đợi. Dialog PHẢI mount ở
   `hub-queue-table.tsx` (§2.4).

## 5. Test / verify trước khi merge

- [ ] Mở Hub, expand 1 kỳ `SalesClosed` (đã hoặc giả lập bằng đóng bán 1 kỳ Scheduled/SalesOpen).
      Nút "Công bố kết quả" phải mở dialog **ngay trong trang Hub** — không chuyển tab, không
      điều hướng.
- [ ] Tiêu đề dialog hiện đúng `"Kết quả — Kỳ {drawId} — HH:mm"` — **không** hiện chuỗi ISO
      (verify trực tiếp bug §1 câu 4 đã fix, không chỉ tin code review).
- [ ] Có ≥2 kỳ `SalesClosed` cùng lúc (kể cả vắt qua 2 ngày khác nhau, mô phỏng đúng bug p1-06 đã
      gặp — §1 câu 8): nút "Xác nhận & Kỳ tiếp ▶" phải hiện, bấm xong kỳ #1 → dialog tự chuyển
      đúng kỳ #2 (kể cả khi #2 thuộc ngày khác), **không** bỏ sót kỳ nào.
- [ ] **Bấm "Xác nhận & Kỳ tiếp" — dialog KHÔNG tự tắt** (regression test cho bug đã sửa 09/09):
      sau khi mutation thành công, dialog vẫn mở, chuyển đúng sang kỳ tiếp theo, panel bên dưới
      (nếu đang expand đúng kỳ vừa publish) đóng lặng lẽ do đổi tab/status — đây là hành vi ĐÚNG,
      khác với dialog tự tắt.
- [ ] Publish thành công 1 kỳ → đóng dialog → **không cần F5** — dòng bảng 5A/5B của kỳ đó tự
      chuyển sang `Published` ở lần poll kế tiếp (verify invalidate `kenoKeys.opsHub()` hoạt động
      qua Network tab hoặc React Query devtools, không chỉ đoán từ code §1 câu 3).
- [ ] Kỳ **không phải** `SalesClosed` (VD `Published` chưa `isResettleReady`) — nút hành động vẫn
      là mutation Settle như cũ, **không** bị đổi nhầm sang mở dialog publish.
- [ ] Icon "Mở trang vận hành chi tiết" (external link) ở header panel vẫn hoạt động — escape
      hatch không bị ảnh hưởng.
- [ ] `biome check` + `pnpm --filter @megawin/backoffice check-types` (hoặc `tsc --noEmit` scope
      backoffice) xanh, không lỗi mới ngoài baseline.
- [ ] Trang `/games/keno/operations` — **0 dòng bị sửa** ngoài `draw-actions/index.ts` (chỉ thêm 1
      dòng export type, không đổi hành vi). Xác nhận bằng `git diff --stat`.

## 6. Review checklist

- [ ] `draw-actions/index.ts` chỉ thêm **đúng 1 dòng** export type, không sửa gì khác.
- [ ] `hub-expand-panel.tsx`: nhánh nav Link **vẫn còn** làm fallback (không xoá hẳn) cho status
      ngoài `SalesClosed` lọt vào nhánh `nextAction && !bulkKind` (phòng hờ, §2.3).
- [ ] `toPublishResultDraw` có JSDoc giải thích rõ lý do convert `drawTime` — không phải chuyển
      thẳng, người đọc sau không tự ý "tối ưu" bỏ `displayVNTime()`.
- [ ] Hàng đợi build từ `state.rows` (toàn bộ), **không** từ `state.rows5A`/`rows5B`.
- [ ] Không có `onNext` truyền vào `PublishResultAction` kèm logic đồng bộ panel — nếu có, đó là
      mở rộng ngoài scope plan này, cần ghi rõ lý do riêng.
- [ ] Không file nào của Bingo18 hoặc trang `operations` (ngoài barrel) bị chạm.
- [ ] Test §5 đã chạy đủ, đặc biệt case 2 kỳ vắt ngày khác nhau (bug thật p1-06 đã từng gặp).

## 7. Bingo18 follow — làm gì khi tới `p1-04` (port Hub sang Bingo18)

Hub Bingo18 **chưa tồn tại** (plan `p1-04-bingo18-port.plan.md` vẫn `⏳ pending`) nên plan này
**không** đụng file Bingo18. Khi tới `p1-04`, áp dụng plan này theo đúng 3 bước ở §2, với các điểm
khác biệt **duy nhất** (còn lại giống 100%, kể cả cấu trúc code, tên hàm, vị trí mount):

| Điểm | Keno (plan này) | Bingo18 (khi port) |
|---|---|---|
| Import `PublishResultAction`/`PublishResultDraw` | `keno/operations/_lib/sections/draw-management/draw-actions` | `bingo18/operations/_lib/sections/draw-management/draw-actions` — **đã có** `PublishResultDraw`/queue mode sẵn từ p1-06 (xem `00-overview.md` dòng p1-06: "Sửa 2 cặp file... riêng biệt cho Keno/Bingo18"), chỉ thiếu export `PublishResultDraw` ở barrel giống Keno §2.1 — kiểm tra lại lúc port, đừng giả định đã export |
| `toPublishResultDraw` | Trong `keno/operations-hub/_lib/sections/queue/` | Viết **bản riêng** trong `bingo18/operations-hub/_lib/sections/queue/` — **không** tạo hàm chung 2 game (đúng nguyên tắc `p1-04` §4.2 "không base class/generic chia sẻ 2 game") |
| Field nguồn `drawTime` | `DerivedRow.drawTime` (ISO, ổn định) | **Verify lại** Bingo18 `OpsHubDrawRow.drawTime` cũng là ISO 8601 (khả năng cao giống Keno vì cùng 1 DTO pattern từ `p0-03`/`p1-04` §3.1, nhưng đọc code thật lúc port — đừng copy giả định) |
| Case cần dialog | `DrawStatus.SalesClosed` | **Giống hệt** — `DrawStatus` là enum chung `game-core`, không đổi theo game |
| Query invalidate | `kenoKeys.opsHub()` con của `kenoKeys.all` | `bingo18Keys.opsHub()` con của `bingo18Keys.all` — **verify lại cấu trúc key**, đừng giả định giống 100% (dù nhiều khả năng cùng pattern) |
| Test §5 | Test trên data Keno | Lặp lại TOÀN BỘ §5 trên data Bingo18 — **thêm** case kỳ `SalesClosed` với `salesCloseBeforeSeconds = 30` (khác Keno 60, xem `p1-04` §2.1) để chắc dialog không phụ thuộc giá trị này (dialog không đọc field này — chỉ Hub derive state mới cần, nhưng vẫn nên test để chắc không có phụ thuộc ẩn) |

**Không port sớm.** Theo nguyên tắc chung của thư mục plan (`00-overview.md` — "Thời gian chờ bắt
buộc"), việc lắp inline dialog vào Hub Bingo18 chỉ nên làm **cùng lúc** với `p1-04` (port toàn bộ
Hub), không tách plan riêng làm trước — vì Hub Bingo18 còn chưa có `hub-expand-panel.tsx` để sửa.

## 8. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Gán thẳng `drawTime` ISO thay vì convert `displayVNTime` → tiêu đề dialog hiện chuỗi ISO | 🟡 | §1 câu 4 + §5 test tiêu đề bắt buộc verify bằng mắt, không chỉ đọc code |
| Build hàng đợi từ `rows5A` (đã lọc tab) thay vì `state.rows` (toàn bộ) → bỏ sót kỳ `SalesClosed` ở tab khác | 🟡 | §1 câu 7 + review checklist §6 |
| Lặp lại bug `slice(idx)` bỏ sót kỳ tồn ngày trước (đã xảy ra thật ở p1-06) | 🟡 | §2.3 dùng đúng pattern `[current, ...pending.filter(...)]`, test §5 case 2 ngày |
| Xoá hẳn nhánh Link nav thay vì giữ làm fallback → nếu tương lai `bulkKindForStatus`/`getNextAction` thêm case mới không có mutation, Hub "mất" nút hành động im lặng (đúng bug p1-08 §6 đã fix 1 lần, có thể lặp lại kiểu khác) | 🟢 | §2.3 giữ fallback Link, §6 review checklist bắt buộc kiểm tra còn fallback |
| Port Bingo18 copy giả định (query key, field ISO) không đọc lại code thật | 🟡 | §7 bảng liệt kê rõ "verify lại", không cho copy trực tiếp |

## 9. Rollback

Revert commit — thay đổi chỉ 2-3 file, không chạm schema/DB/API. Trang `operations` không bị ảnh
hưởng (chỉ thêm 1 dòng export type ở barrel, không đổi hành vi runtime của bất kỳ export nào).
