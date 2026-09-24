# Plan: Thống nhất "kỳ active" — GetActiveDrawsSharedUseCase

Mục tiêu: chấm dứt mâu thuẫn giữa trang **Lịch sử kỳ quay** (`GetCurrentDrawUseCase`) và trang
**Vận hành** (`GetDrawSelectorUseCase`) — hai nơi định nghĩa "kỳ đang vận hành" khác nhau
(khác cả tập status lẫn `lookbackDays`). Demo trên **Lotto 5/35** trước, sau đó nhân bản cho 6 game.

## Nguyên tắc cốt lõi

- Bỏ `lookbackDays` cho việc lấy "kỳ active". Lọc thuần theo `status $in DRAW_UNFINISHED_STATUSES`.
- Dựa vào index `{ status: 1, drawId: -1 }` (chuẩn hoá DESC toàn hệ thống — xem PHẦN D).
  `Settled`/`Void` (≈99.99% dữ liệu) không nằm trong tập unfinished → IXSCAN không chạm kỳ cũ.
- `$in` + sort `drawId` dùng được cả index ASC lẫn DESC (MongoDB traverse index 2 chiều) → an toàn
  bất kể chiều index. Sau chuẩn hoá, TẤT CẢ game dùng `{status:1, drawId:-1}`.

## 3 chuẩn hoá bắt buộc (áp cho cả 7 game)

1. **Index**: mọi collection `Draws` dùng `{ status: 1, drawId: -1 }`, name `idx_status_drawId_desc`.
   Hiện chỉ lotto535 + keno đã DESC; 5 game còn lại (mega645, power655, max3d, max3dpro, bingo18)
   đang ASC `{status:1, drawId:1}` name `idx_status_drawId` → phải đổi (PHẦN D).
2. **Bộ 3 group chuẩn**: selector chỉ dùng `"active" | "future" | "recent"`. keno & bingo18 đang dùng
   `"upcoming"` → đổi thành `"future"` (giữ nguyên logic slice/limit, chỉ đổi tên group).
3. **DTO naming chuẩn**: interface "kỳ hiện tại" tên trần `CurrentDrawInfo` (không prefix game).
   keno (`KenoCurrentDrawInfo`) & bingo18 (`Bingo18CurrentDrawInfo`) → đổi thành `CurrentDrawInfo`.
   `GetCurrentDrawInput/Output` và `DrawSelectorItem` đã đồng nhất, giữ nguyên.

---

## PHẦN A — Demo Lotto 5/35

### A1. Thêm method repo dùng chung
File: `packages/game-lotto535-application/src/infras/repos/draw-repo.ts`

Thêm method mới (KHÔNG sửa `getActiveDraws` cũ — giữ cho future/recent):

```
/**
 * Lấy TẤT CẢ kỳ chưa hoàn thành (unfinished) — single source of truth "kỳ đang vận hành".
 *
 * Lọc thuần theo status ∈ DRAW_UNFINISHED_STATUSES (Scheduled..Voiding), KHÔNG lookback theo
 * drawDate. An toàn về performance: `status` là equality prefix của idx_status_drawId_desc →
 * IXSCAN chỉ chạm kỳ unfinished (vài chục), không bao giờ scan kỳ Settled/Void cũ.
 * Bắt trọn 100% kỳ kẹt bất kể cũ bao lâu.
 */
async getUnfinishedDraws(options?: FindOptions): Promise<DrawEntity[]> {
  return await this.findMany(
    { status: { $in: [...DRAW_UNFINISHED_STATUSES] } },
    { sort: { drawId: -1 }, ...options },
  );
}
```

- Import `DRAW_UNFINISHED_STATUSES` từ `@megawin/game-core/entities` (đã import sẵn ở repo này).
- Sort `{ drawId: -1 }` (desc, mới→cũ) — KHỚP index chuẩn `idx_status_drawId_desc`. Tập unfinished nhỏ
  (vài chục kỳ) nên consumer tự re-sort nếu cần hiển thị cũ→mới (rẻ, không đáng kể).

### A2. Tạo GetActiveDrawsSharedUseCase (internal, không expose route riêng)
File mới: `packages/game-lotto535-application/src/use-cases/draws/get-active-draws-shared.ts`

Nội dung: một internal use-case (hoặc helper class) trả `DrawEntity[]` unfinished, gói `getUnfinishedDraws`.
Cân nhắc: có thể để đơn giản là gọi thẳng `drawRepo.getUnfinishedDraws()` trong 2 use-case tiêu thụ mà
KHÔNG cần tạo class riêng — vì logic chỉ là 1 query. **Quyết định: KHÔNG tạo class use-case riêng**,
chỉ dùng chung method repo `getUnfinishedDraws()` để tránh over-engineer. "Shared" nằm ở tầng repo.

### A3. Sửa GetCurrentDrawUseCase
File: `packages/game-lotto535-application/src/use-cases/draws/get-current-draw.ts`

- Xoá const `ACTIVE_STATUSES` cục bộ (dòng 23-29).
- Thay `this.drawRepo.getActiveDraws(allowStatuses)` bằng `this.drawRepo.getUnfinishedDraws()`.
- Giữ `input.allowStatuses` trong DTO cho backward-compat NHƯNG bỏ dùng (hoặc: nếu truyền thì filter
  in-memory tập trả về). Đơn giản nhất: bỏ đọc `input.allowStatuses`, luôn trả toàn bộ unfinished.
- `mapped` giữ nguyên (sort đã asc từ repo).

### A4. Sửa route current
File: `apps/backoffice/src/app/api/lotto535/draws/current/route.ts`

- Bỏ block override `allowStatuses` (dòng 11-20). Gọi `getCurrentDrawUseCase.run({})`.
- Bỏ import `DrawStatus` nếu không còn dùng.

### A5. Sửa GetDrawSelectorUseCase — nhóm active lấy từ unfinished
File: `packages/game-lotto535-application/src/use-cases/operations/get-draw-selector.ts`

- Thay 3 query `getActiveDraws(...)` bằng:
  - 1 query `getUnfinishedDraws()` lấy TẤT CẢ kỳ unfinished.
  - Giữ `getActiveDraws(recentStatuses, 2)` cho nhóm recent (Settled/Void 48h — lookback hợp lý, giữ nguyên).
- Phân loại lại tập unfinished thành 2 nhóm hiển thị (giữ UX dropdown cũ):
  - `future`: status === Scheduled VÀ drawDate >= yesterdayVN() (kỳ tương lai chưa mở).
  - `active`: mọi kỳ unfinished còn lại (SalesOpen, SalesClosed, Published, Settling, Voiding, và cả
    Scheduled đã tới hạn/quá khứ — coi như cần xử lý).
- Kết quả: KHÔNG sót kỳ kẹt (dù cũ bao lâu vẫn vào nhóm active), UX nhóm giữ nguyên.

### A6. Verify Lotto 5/35
- `pnpm --filter @megawin/game-lotto535-application check-types`
- `pnpm --filter @megawin/backoffice check-types`
- Test tay: tạo kỳ SalesOpen, lùi drawDate > 7 ngày (hoặc dùng dữ liệu thật kỳ kẹt) → cả 2 trang phải
  thấy đồng nhất là có kỳ active.

---

## PHẦN B — Nhân bản cho 6 game (theo thứ tự rủi ro thấp→cao)

Áp dụng CÙNG pattern A1–A5 cho từng game. Sau chuẩn hoá index (PHẦN D), TẤT CẢ game sort
`getUnfinishedDraws` = `{ drawId: -1 }` (khớp `idx_status_drawId_desc`). Lưu ý khác biệt còn lại:

### B1. Nhóm "future/recent" — mega645, power655, max3dpro (giống lotto535 nhất)
- draw-selector kiến trúc future/recent giống hệt lotto535 → áp thẳng A1–A5.
- DTO `CurrentDrawInfo` (đã chuẩn), group đã là `active|future|recent` (đã chuẩn), Create số nhiều.
- Index: đổi ASC→DESC theo PHẦN D (mega645 L144, power655 L185, max3dpro L155).

### B2. max3d (gần giống nhưng có recentOnly 48h filter)
- Áp A1–A5. Giữ nguyên `recentOnly` filter 48h cho nhóm recent.
- Bỏ `LOOKBACK_DAYS=7` truyền tay ở get-current-draw (dòng gọi getActiveDraws) → dùng getUnfinishedDraws.
- DTO `CurrentDrawInfo` (đã chuẩn), group `active|future|recent` (đã chuẩn). Index đổi ASC→DESC (L162).

### B3. Nhóm "upcoming/recent" tần suất cao — keno, bingo18 (KHÁC kiến trúc + LỆCH naming/group)
- get-current-draw dùng `getActiveDraws(...)` với lookback `undefined` (đã không filter ngày → gần như
  đã đúng, chỉ cần đổi sang `getUnfinishedDraws` cho nhất quán + dùng index thay vì full scan).
- draw-selector: thay query active bằng `getUnfinishedDraws()`, phân loại:
  - `future`: Scheduled, sort theo drawTime asc, `.slice(0,10)` (giữ giới hạn 10 kỳ sắp tới).
    ⚠️ ĐỔI TÊN group `upcoming` → `future` (xem PHẦN E) — chỉ đổi literal, giữ nguyên slice/limit.
  - `active`: unfinished còn lại (không phải Scheduled).
  - `recent`: giữ `getActiveDraws([Settled,Void], 1)`.
- ⚠️ DTO: đổi `KenoCurrentDrawInfo`/`Bingo18CurrentDrawInfo` → `CurrentDrawInfo` (xem PHẦN E).
- Create số ít (`CreateDrawUseCase`).
- keno index ĐÃ DESC (giữ nguyên); bingo18 đổi ASC→DESC (L152).

### B4. Chuẩn hoá `getUnfinishedDraws` method
- Thêm `getUnfinishedDraws()` vào `draw-repo.ts` của cả 6 game (copy từ lotto535, sort `{drawId:-1}`).
- KHÔNG cần đụng `getActiveDraws` cũ (vẫn dùng cho recent).

---

## PHẦN D — Đồng bộ index Draws về `{ status: 1, drawId: -1 }` (5 game)

Mục tiêu: mọi collection `Draws` dùng CÙNG index `{ status: 1, drawId: -1 }`, name `idx_status_drawId_desc`.

Hiện trạng:

| Game | Hiện tại | Line file `indexes/index.ts` | Cần làm |
|---|---|---|---|
| lotto535 | DESC `idx_status_drawId_desc` | 276 | ✅ giữ nguyên |
| keno | DESC `idx_status_drawId_desc` | 183 | ✅ giữ nguyên |
| mega645 | ASC `idx_status_drawId` | 144 | 🔧 đổi key `-1` + name `_desc` |
| power655 | ASC `idx_status_drawId` | 185 | 🔧 đổi key `-1` + name `_desc` |
| max3d | ASC `idx_status_drawId` | 162 | 🔧 đổi key `-1` + name `_desc` |
| max3dpro | ASC `idx_status_drawId` | 155 | 🔧 đổi key `-1` + name `_desc` |
| bingo18 | ASC `idx_status_drawId` | 152 | 🔧 đổi key `-1` + name `_desc` |

Với 5 game ASC: sửa `key: { status: 1, drawId: 1 }` → `{ status: 1, drawId: -1 }` và
`name: "idx_status_drawId"` → `"idx_status_drawId_desc"`.

**Migration DB (quan trọng — đổi name = tạo index mới):** đổi `name` khiến MongoDB coi là index khác.
Cần script drop index cũ `idx_status_drawId` rồi tạo mới `idx_status_drawId_desc` (hoặc chạy tiến trình
sync index của hệ thống). Ghi rõ bước này khi deploy — KHÔNG để 2 index trùng key tồn tại song song.

**Không phá `findNextPendingDraw`** (lotto535 L562, mega645 L563, power655 L527): method này filter
`status $in + drawId $gt afterDrawId` sort `{ drawId: 1 }` limit 1. Index `{status:1, drawId:-1}` VẪN
phục vụ được (MongoDB duyệt index ngược để thoả sort asc + range) → không cần sửa method. Comment hint
index trong code là `{drawId:1, status:1}` (index khác), không liên quan tới `idx_status_drawId*`.

---

## PHẦN E — Đồng bộ DTO naming & group (keno, bingo18)

### E1. Interface "kỳ hiện tại" → `CurrentDrawInfo` (bỏ prefix)
File: `packages/game-{keno,bingo18}-application/src/use-cases/draws/dto/current-draw.dto.ts`
- keno: `KenoCurrentDrawInfo` (L9) → `CurrentDrawInfo`.
- bingo18: `Bingo18CurrentDrawInfo` (L10) → `CurrentDrawInfo`.
- Rename mọi reference trong package (use-case, mapper, barrel `index.ts`, và `apps/backoffice` nếu
  import type này). Grep `KenoCurrentDrawInfo` / `Bingo18CurrentDrawInfo` toàn repo trước khi đổi.
- `GetCurrentDrawInput/Output` giữ nguyên (đã đồng nhất, không prefix).

### E2. Union `group` → `"active" | "future" | "recent"` (bỏ "upcoming")
File: `packages/game-{keno,bingo18}-application/src/use-cases/operations/dto/draw-selector.dto.ts`
- keno (L50) & bingo18 (L51): đổi `"upcoming"` → `"future"` trong union type.
- Sửa `get-draw-selector.ts` tương ứng: chỗ gán `group: "upcoming"` → `group: "future"`.
- Backoffice: grep `"upcoming"` trong `apps/backoffice/src/app/(main)/games/{keno,bingo18}/**` (label,
  filter, switch-case render nhóm) và đổi sang `"future"`. Giữ label hiển thị tiếng Việt nếu cần
  (VD "Kỳ sắp tới") — chỉ đổi giá trị `group` nội bộ, không nhất thiết đổi text UI.

### E3. (Ghi nhận, KHÔNG ép trong scope này) type `drawNo`
`drawNo` lệch giữa game (`1|2`, `1`, `number`) do đặc thù số kỳ/ngày mỗi game — KHÔNG đồng bộ ở đây
vì đúng về nghiệp vụ (lotto535 có 2 kỳ/ngày, mega/power 1 kỳ/ngày). Chỉ ghi nhận.

---

## PHẦN C — Không thuộc scope lần này (ghi nhận để làm sau)
- Detect/cảnh báo kỳ stale (kẹt quá hạn) — bước riêng.
- Tự động hoá tạo kỳ + mở/đóng bán theo giờ.
- Đồng bộ default `lookbackDays` của `getActiveDraws` giữa các game (2/7/undefined) — chỉ cần khi
  còn nơi khác dùng; nhóm active đã không còn phụ thuộc nó sau refactor.
- Đồng bộ type `drawNo` giữa các game (xem E3).

---

## Checklist verify mỗi game (PHẦN A–E)
- [x] Index Draws = `{status:1, drawId:-1}` name `idx_status_drawId_desc` (PHẦN D; 5 game cần đổi + migration).
- [x] `getUnfinishedDraws()` thêm vào draw-repo, sort `{ drawId: -1 }`.
- [x] get-current-draw: bỏ ACTIVE_STATUSES + dùng getUnfinishedDraws, bỏ đọc allowStatuses.
- [x] route current: bỏ override allowStatuses.
- [x] get-draw-selector: nhóm active/future lấy từ getUnfinishedDraws.
- [x] DTO: interface = `CurrentDrawInfo` (keno/bingo18 bỏ prefix); group = `active|future|recent` (bỏ upcoming).
- [x] check-types pass cho package + backoffice.
- [ ] Test kỳ kẹt cũ hiển thị đồng nhất 2 trang (verify tay, ngoài scope agent).
- [x] `findNextPendingDraw` vẫn chạy đúng sau đổi index (3 game: lotto535, mega645, power655).

---

## PHẦN F — Chuẩn hoá nhóm "recent" (5 kỳ gần nhất, bỏ lookbackDays)

### Vấn đề phát hiện sau khi hoàn tất PHẦN A–E

Nhóm `recent` KHÔNG bị mất dữ liệu như bug "kỳ kẹt" ban đầu (`GetCurrentDrawUseCase` có fallback
`isHistorical` hiển thị toàn bộ history không lookback), nhưng có 3 vấn đề nhất quán:

1. **`lookbackDays` không đồng nhất và gây hiểu nhầm**: mega645/power655/max3dpro gọi
   `getActiveDraws(recentStatuses)` KHÔNG truyền `lookbackDays` → dùng default (7 ngày) nhưng label UI
   ghi "Vừa hoàn thành (48h)" — sai lệch giữa code và label. max3d/lotto535 lookback 7 ngày rồi filter
   in-memory xuống 48h — tốn query dư (fetch 7 ngày chỉ để giữ 2 ngày). keno/bingo18 lookback 1 ngày +
   `.reverse().slice(0,15)` — không nhất quán số lượng/thời gian với các game khác.
2. **Game tần suất thấp có thể ra danh sách rỗng đúng lúc cần**: mega645/power655/max3d/max3dpro chỉ
   quay 1–3 kỳ/tuần → lookback 48h thường XÓA HẾT kỳ vừa hoàn thành (kỳ trước đó có thể cách >48h).
   Đây không phải "mất dữ liệu" (không ảnh hưởng active/future) nhưng làm nhóm recent vô dụng phần lớn
   thời gian đối với các game tần suất thấp.
3. **Label UI không đồng nhất**: hầu hết ghi "Vừa hoàn thành (48h)" (kể cả khi code không phải 48h),
   keno/bingo18 đã đúng ghi "Vừa hoàn thành" (không con số).

### Giải pháp: lấy theo SỐ PHIÊN cố định (5), bỏ hoàn toàn `lookbackDays` cho nhóm recent

Thay `getActiveDraws(recentStatuses, lookbackDays)` bằng method mới `getRecentCompletedDraws(limit=5)`:
lọc `status $in DRAW_COMPLETED_STATUSES`, sort `{drawId:-1}`, `limit: 5` — KHÔNG điều kiện `drawDate`.

Lý do chọn **5 phiên** thống nhất cho cả 7 game (kể cả keno/bingo18 tần suất ~120–160 kỳ/ngày):
- Tự thích ứng tần suất quay của từng game — không cần biết trước lịch quay, không bao giờ rỗng bất
  thường (miễn tồn tại ≥5 kỳ đã settle trong lịch sử).
- Đủ để staff tra soát/resettle nhanh (nhu cầu chính của nhóm recent), không cần nhiều hơn.
- Nhất quán 1 con số duy nhất trên toàn hệ thống → dễ nhớ, dễ debug, dễ maintain.
- Performance: `status $in` là equality prefix của `idx_status_drawId_desc`, sort khớp chiều index →
  IXSCAN, dừng ngay khi đủ `limit` (không quét toàn bộ `Settled`/`Void` — phần lớn dữ liệu).

### F1. Thêm method `getRecentCompletedDraws` — tất cả 7 game
File: `packages/game-{game}-application/src/infras/repos/draw-repo.ts`

```
async getRecentCompletedDraws(limit = 5, options?: FindOptions): Promise<DrawEntity[]> {
  return await this.findMany(
    { status: { $in: [...DRAW_COMPLETED_STATUSES] } },
    { sort: { drawId: -1 }, limit, ...options },
  );
}
```
Import thêm `DRAW_COMPLETED_STATUSES` từ `@megawin/game-core/entities`.

### F2. Sửa `get-draw-selector.ts` — tất cả 7 game
- lotto535/mega645/power655/max3dpro: thay `getActiveDraws(recentStatuses, N)` → `getRecentCompletedDraws(5)`,
  thêm bước re-sort ASC (`toSorted(byDrawIdAsc)`) vì method mới trả DESC.
- max3d/max3dpro: XOÁ hoàn toàn bước filter in-memory 48h (`recentOnly = recentDraws.filter(...)`) —
  không còn cần vì `getRecentCompletedDraws` đã limit đúng số lượng ngay tại DB.
- keno/bingo18: thay `getActiveDraws([Settled,Void], 1).then(d => d.reverse().slice(0,15))` →
  `getRecentCompletedDraws(5)` + re-sort ASC. Bỏ `.reverse().slice(0,15)` (dư thừa, method mới đã limit).
- Sau khi đổi hết, `getActiveDraws` không còn dùng ở get-draw-selector nào — vẫn giữ nguyên method này
  trong repo (dùng ở nơi khác/`findNextPendingDraw` liên quan, không thuộc scope xoá).

### F3. Đồng bộ label UI → "Vừa hoàn thành" (bỏ "(48h)")
File: `apps/backoffice/src/app/(main)/games/{game}/operations/_lib/draw-selector.tsx`
- lotto535, mega645, power655, max3d, max3dpro: đổi label "Vừa hoàn thành (48h)" → "Vừa hoàn thành".
- keno, bingo18: đã đúng "Vừa hoàn thành" — không cần sửa.

### Checklist verify PHẦN F
- [x] lotto535: getRecentCompletedDraws(5) + get-draw-selector + label.
- [x] mega645: getRecentCompletedDraws(5) + get-draw-selector + label.
- [x] power655: getRecentCompletedDraws(5) + get-draw-selector + label.
- [x] max3d: getRecentCompletedDraws(5) + get-draw-selector (bỏ filter in-memory 48h) + label.
- [x] max3dpro: getRecentCompletedDraws(5) + get-draw-selector (bỏ filter in-memory 48h) + label.
- [x] keno: getRecentCompletedDraws(5) + get-draw-selector (bỏ `.reverse().slice(0,15)`).
- [x] bingo18: getRecentCompletedDraws(5) + get-draw-selector (bỏ `.reverse().slice(0,15)`).
- [x] check-types pass toàn bộ 7 package-application + backoffice.

---

## PHẦN G — Mở rộng `getUnfinishedDraws` nhận subset status (DRY, fix 4 nơi còn lookback)

### Vấn đề: `getActiveDraws(statuses, lookbackDays)` vẫn còn 4 nhóm consumer dùng lookback trên status
CHƯA HOÀN THÀNH (non-terminal) → cùng bug "kỳ kẹt bị mất" như bug gốc đã fix cho selector:

| Consumer (áp cho cả 7 game trừ khi ghi chú) | Status subset | lookbackDays | Rủi ro |
|---|---|---|---|
| `use-cases/player/get-current-draw-player.ts` | `[SalesOpen, SalesClosed]` | default 2 | Player không thấy kỳ SalesOpen kẹt >2 ngày |
| `use-cases/reports/sync-outstanding.ts` | `[SalesOpen, SalesClosed, Published, Settling]` | 3–7 | Report outstanding thiếu kỳ kẹt cũ |
| `use-cases/draws/preview-draws.ts` (lotto535, mega645, power655, max3d, max3dpro) | 5 status, **thiếu `Voiding`** | default 2 | Preview/slot calc không thấy kỳ kẹt cũ hoặc đang Voiding → gợi ý sai slot |
| `use-cases/draws/create-draws.ts` (max3d, max3dpro) | như trên | default 2 | Tương tự preview; có `getDrawById` chặn insert trùng ID nên KHÔNG mất data, chỉ sai gợi ý slot |
| `apps/backoffice/.../get-dashboard-draws.ts` | `ACTIVE_STATUSES` (5 status, không Scheduled) | default 2 | Dashboard đếm thiếu kỳ active kẹt cũ |

Riêng dashboard's `getActiveDraws(COMPLETED_STATUSES, 2, {limit})` (nhóm "settled 48h") **KHÔNG có rủi ro** vì
`Settled`/`Void` là trạng thái cuối (terminal) — không thể "kẹt". Đây là cửa sổ recency hợp lệ, GIỮ NGUYÊN
dùng `getActiveDraws` (không đổi).

### Giải pháp DRY: mở rộng `getUnfinishedDraws` nhận optional `statuses` param — TYPE-SAFE
File: `packages/game-{game}-application/src/infras/repos/draw-repo.ts` (cả 7 game)

**Quyết định đặt tên** (câu hỏi: subset status thì tên `getUnfinishedDraws` còn đúng không?): tên
VẪN ĐÚNG — subset của unfinished vẫn luôn là unfinished. Nhưng để chặn compile-time việc lỡ truyền
`Settled`/`Void` vào (gây full-collection scan), thêm 2 type mới ở `game-core.enums.ts`:

```ts
export type CompletedDrawStatus = typeof DrawStatus.Settled | typeof DrawStatus.Void;
export const DRAW_COMPLETED_STATUSES: readonly CompletedDrawStatus[] = [DrawStatus.Settled, DrawStatus.Void];

const COMPLETED_STATUS_SET = new Set<DrawStatus>(DRAW_COMPLETED_STATUSES);
export type UnfinishedDrawStatus = Exclude<DrawStatus, CompletedDrawStatus>;
export const DRAW_UNFINISHED_STATUSES: readonly UnfinishedDrawStatus[] = DRAW_STATUS_VALUES.filter(
  (status): status is UnfinishedDrawStatus => !COMPLETED_STATUS_SET.has(status),
);
```

Rồi ràng buộc param `statuses` bằng `UnfinishedDrawStatus` (không phải `DrawStatus` rộng):

```ts
/**
 * Lấy kỳ chưa hoàn thành (unfinished) — single source of truth "kỳ đang vận hành".
 *
 * @param statuses - Subset status cần lọc (default: TOÀN BỘ DRAW_UNFINISHED_STATUSES). Kiểu
 *   UnfinishedDrawStatus CHẶN compile-time việc lỡ truyền Settled/Void vào. Truyền subset khi
 *   consumer chỉ cần 1 phần (VD player chỉ cần SalesOpen/SalesClosed) — VẪN an toàn tuyệt đối vì
 *   KHÔNG lookback theo drawDate, không bỏ sót kỳ kẹt dù cũ bao lâu.
 * @param options - FindOptions override (sort, limit, projection...). Truyền `sort` để override
 *   default `{drawId:-1}` khi cần thứ tự khác (VD ASC cho "next scheduled").
 */
async getUnfinishedDraws(
  statuses: readonly UnfinishedDrawStatus[] = DRAW_UNFINISHED_STATUSES,
  options?: FindOptions,
): Promise<DrawEntity[]> {
  return await this.findMany(
    { status: { $in: [...statuses] } },
    { sort: { drawId: -1 }, ...options },
  );
}
```

Backward-compatible 100%: mọi call site hiện tại gọi `getUnfinishedDraws()` (0 args) không đổi hành vi.
Performance: subset nhỏ hơn vẫn dùng CÙNG equality-prefix trên `idx_status_drawId_desc` → IXSCAN, thậm chí
touch ÍT bucket hơn (nhanh hơn hoặc bằng, không bao giờ chậm hơn).

### G1. Sửa từng consumer — thay `getActiveDraws(subset, lookback)` → `getUnfinishedDraws(subset)`
- `get-current-draw-player.ts`: `getActiveDraws(PLAYER_STATUSES)` → `getUnfinishedDraws(PLAYER_STATUSES)`.
- `sync-outstanding.ts`: `getActiveDraws([...4 status], N)` → `getUnfinishedDraws([...4 status])` (bỏ lookback).
- `preview-draws.ts`: `getActiveDraws([5 status thiếu Voiding])` → `getUnfinishedDraws()` (dùng default TOÀN
  BỘ 6 status — vừa bỏ lookback vừa vá luôn thiếu sót `Voiding`).
- `create-draws.ts` (max3d, max3dpro): tương tự preview-draws → `getUnfinishedDraws()`.
- `get-dashboard-draws.ts`: **HOÃN tới khi 7 game đều xong** — file này gọi đồng thời cả 7 repo qua 1
  interface duck-typed `getActiveDraws(...)`, phải đổi tất cả 7 game cùng lúc thì mới đổi được interface
  này. Khi đổi: `repo.getUnfinishedDraws(ACTIVE_STATUSES)` (active) và
  `repo.getUnfinishedDraws([DrawStatus.Scheduled], { sort: { drawId: 1 }, limit })` (scheduled — cần ASC
  để lấy kỳ SỚM NHẤT, không phải DESC default). Giữ nguyên `getActiveDraws` cho nhóm settled 48h.

### G2. JSDoc cảnh báo trên `getActiveDraws`
Thêm đoạn cảnh báo: "⚠️ CHỈ dùng cho status ĐÃ HOÀN THÀNH cần cửa sổ recency theo ngày (VD settled/void
gần đây cho timeline). KHÔNG dùng cho status CHƯA HOÀN THÀNH — dùng `getUnfinishedDraws(subset)` để
tránh bỏ sót kỳ kẹt." — ngăn lỗi tái diễn trong tương lai khi thêm consumer mới.

### Checklist verify PHẦN G (Lotto 5/35 xong, còn lại 6 game)
- [x] `CompletedDrawStatus`/`UnfinishedDrawStatus` type + narrow `DRAW_COMPLETED_STATUSES`/`DRAW_UNFINISHED_STATUSES` trong `game-core.enums.ts`.
- [x] Lotto535 `getUnfinishedDraws` thêm param `statuses: readonly UnfinishedDrawStatus[]`.
- [x] Lotto535 `get-current-draw-player.ts`.
- [x] Lotto535 `sync-outstanding.ts`.
- [x] Lotto535 `preview-draws.ts` (không có create-draws.ts dùng getActiveDraws — dùng getDrawsByIds).
- [x] Lotto535 JSDoc cảnh báo trên `getActiveDraws`.
- [x] check-types pass (game-core + lotto535-application).
- [ ] mega645: `getUnfinishedDraws` + `get-current-draw-player.ts` + `sync-outstanding.ts` + `preview-draws.ts` + JSDoc.
- [ ] power655: tương tự mega645.
- [ ] max3d: tương tự + `create-draws.ts`.
- [ ] max3dpro: tương tự + `create-draws.ts`.
- [ ] keno: `getUnfinishedDraws` + `get-current-draw-player.ts` + `sync-outstanding.ts` + JSDoc (không có preview/create-draws pattern này).
- [ ] bingo18: tương tự keno.
- [ ] `get-dashboard-draws.ts` — sửa sau khi cả 7 game xong.
- [ ] check-types pass toàn bộ sau khi xong hết.

