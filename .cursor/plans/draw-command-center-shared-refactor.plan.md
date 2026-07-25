# Refactor: Shared Draw Command Center + Fix Date Type ở GetDrawDetailOutput

## Bối cảnh

Sau khi hoàn thành UX upgrade cho Keno/Bingo18/Max3D/Max3dpro/Lotto535/Mega645/Power655,
phát hiện 2 vấn đề qua audit kỹ (hash/diff trực tiếp từng hàm ở 7 file `draw-command-center.tsx`):

1. **Date type sai tại nguồn**: `GetDrawDetailOutput.draw: DrawEntity` dùng thẳng domain entity
   (Date fields) làm response type HTTP, trong khi runtime luôn là ISO string sau JSON round-trip.
   FE phải cast `as unknown as string` ở 14 vị trí (7× `use-draw-context.tsx` + 7×
   `entry-detail-dialog.tsx`) để né type error.
2. **Trùng lặp code lớn** ở `draw-command-center.tsx` giữa 7 game — `ScheduleChips` giống
   100% byte-for-byte, `getSteps()` giống 100% logic, `LifecycleStepper` giống ~95% (chỉ khác
   accent màu ở Keno/Bingo18), `getNextAction` giống ~95% (Max3D/Max3dpro viết inline thay vì
   hàm riêng), `shouldShowResettle` giống logic nhưng khác field (`drawResultAt` vs
   `resultPublishedAt`).

## A. Fix Date Type — `GetDrawDetailOutput`

### A1. Utility type `WireType<T>`

Tạo `packages/shared/src/types/wire-type.ts`:

```typescript
export type WireType<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Array<WireType<U>>
    : T extends object
      ? { [K in keyof T]: WireType<T[K]> }
      : T;
```

Export qua `packages/shared/src/types/index.ts` (đã có export path `@megawin/shared/types`).

**Vì sao dùng utility type generic thay vì viết DTO tay từng field:** `DrawEntity` mỗi game
có nested structure lớn (result, jackpot, financial, stats, voidInfo, voidSummary,
settleSummary, vietlottRef, sales — nhiều field Date lồng nhau). Viết DTO tay cho cả 7 game
sẽ trùng lặp toàn bộ field lần 2 (rủi ro lệch khi entity đổi). `WireType<T>` map tự động,
đúng 1 lần, dùng lại cho mọi entity.

**Contract:** `WireType<T>` chỉ map `Date → string`. Input phải là Entity đã normalize
(plain type + Date); mọi BSON type (`ObjectId`, `Long`, `Decimal128`) convert ở repo mapper.

### A2. Áp dụng cho 7 game

Ở mỗi `packages/game-{game}-application/src/use-cases/draws/dto/draw.dto.ts`:

```typescript
import type { WireType } from "@megawin/shared/types";

export interface GetDrawDetailOutput {
  /** Entity đầy đủ của kỳ quay — Date fields đã serialize thành ISO string qua JSON response. */
  draw: WireType<DrawEntity>;
}
```

Games: keno, bingo18, max3d, max3dpro, lotto535, mega645, power655.

### A3. Xoá cast ở FE

Xoá `as unknown as string` ở:
- `apps/backoffice/src/app/(main)/games/{game}/operations/_lib/use-draw-context.tsx` (7 file)
- `apps/backoffice/src/app/(main)/games/{game}/operations/_lib/sections/**/entry-detail-dialog.tsx` (7 file, nếu tồn tại)

Sau khi field đã đúng type `string`, giữ nguyên optional chaining logic, chỉ bỏ phần cast.

### A4. Verify

`pnpm --filter @megawin/{game}-application check-types` cho 7 package +
`pnpm --filter @megawin/backoffice check-types`.

## B. Tách Shared Component/Hook

### B0. Đồng bộ field resettle — XOÁ `resultPublishedAt` dư thừa (đã hoàn thành)

**Phát hiện khi audit sâu hơn kế hoạch ban đầu:** `resultPublishedAt` chỉ tồn tại ở
Lotto535/Mega645/Power655, và `drawResultAt` ở nhóm 3 game này bị gắn fallback sai
(`?? drawTimeDate`/hardcode = `drawTimeDate` ở Mega645/Power655 — **bug thật**, không
phản ánh giờ publish thực tế). Ở Keno/Bingo18/Max3D/Max3dpro, `drawResultAt` vốn đã là raw
value (không fallback) — tức là **cùng ý nghĩa với `resultPublishedAt`** của 3 game kia.

**Quyết định (khác kế hoạch gốc):** Thay vì thêm `resultPublishedAt` vào 4 game còn thiếu,
XOÁ HẲN field `resultPublishedAt` (dư thừa) khỏi Lotto535/Mega645/Power655, sửa
`drawResultAt` bỏ fallback ở get-draw-selector.ts (Lotto535) và sửa lại giá trị đúng
(Mega645/Power655 — bug hardcode `drawTimeDate`). Kết quả: cả 7 game dùng chung 1 field
duy nhất `drawResultAt` (raw `result?.publishedAt`, undefined nếu chưa publish) cho cả
`shouldShowResettle`, `canReopenForCascade`, `getSteps()` (có fallback hiển thị riêng ở FE
khi render), `ScheduleChips`.

Đã sửa: DTO + `get-draw-selector.ts` (Lotto535/Mega645/Power655), `use-draw-context.tsx`
(3 game — xoá mapping `resultPublishedAt`), `draw-command-center.tsx` (3 game —
`shouldShowResettle` + `canReopenForCascade` đổi sang dùng `draw.drawResultAt`), JSDoc
`use-operations.ts` (2 game). Verify: check-types pass cho 3 application package + backoffice.

Kết quả cuối: `shouldShowResettle` giờ generic 100%, dùng `draw.drawResultAt` — sẵn sàng
tách shared ở B3 không cần tham số hoá field.

### B1. `apps/backoffice/src/components/games/shared/draw-schedule-chips.tsx` (mới)

Tách `ScheduleChips` nguyên 100% (không tham số hoá gì, giống byte-for-byte ở cả 7 game).

### B2. `apps/backoffice/src/components/games/shared/draw-lifecycle-stepper.tsx` (mới)

Tách `Step`/`StepState` type, `getSteps()` (đổi tên `getDrawLifecycleSteps`, xoá dead param
`result?` không dùng ở 4 game cũ), `LifecycleStepper` component — **đồng bộ 1 màu accent
`primary`** cho tất cả game (theo yêu cầu: không cần tách riêng màu cho Keno/Bingo18, unify
luôn — bỏ `orange-500`/`amber-500` riêng).

### B3. `apps/backoffice/src/components/games/shared/draw-resettle.tsx` (mới)

Tách `shouldShowResettle(draw)` generic — dùng `draw.drawResultAt` (đã đồng nhất ở B0)
cho tất cả 7 game.

### B4. `apps/backoffice/src/components/games/shared/draw-next-action.tsx` (mới)

Tách `getNextAction(draw, handlers, isResettleReady)` — chuẩn hoá Max3D/Max3dpro từ inline
IIFE trong component sang gọi hàm shared giống 5 game khác. Giữ nguyên toàn bộ label/icon/
className hiện có (đã verify giống nhau 100% qua diff).

### B5. Update 7 `draw-command-center.tsx`

Import các hàm/component trên từ shared, xoá định nghĩa local trùng lặp. Giữ riêng những gì
thực sự khác biệt theo game: `canReopenForCascade` (chỉ 3 game jackpot), logic void/edit/
republish riêng, JSX layout tổng thể của command center.

### B6. Verify

`pnpm --filter @megawin/backoffice check-types` + `pnpm --filter @megawin/backoffice lint`.
So sánh UI trước/sau (không đổi hành vi hiển thị, chỉ đổi nơi định nghĩa code).

## Rủi ro & lưu ý

- `canReopenForCascade` là feature CHỈ có ở 3 game jackpot (Lotto535/Mega645/Power655) — cascade
  resettle B2. KHÔNG đưa vào shared, giữ riêng.
- Đồng bộ màu accent Stepper về `primary` sẽ đổi UI nhẹ ở Keno (orange) và Bingo18 (amber) →
  đây là thay đổi có chủ ý theo yêu cầu user, không phải side-effect ngoài ý muốn.
- `WireType<T>` chỉ dùng cho response type (read path), không áp dụng cho input DTO.
