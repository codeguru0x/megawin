# P0-04 — Audit + swap gradient/màu hardcode trùng khớp `game-colors.ts`

**Mục tiêu:** giảm `no-raw-colors` bằng cách thay literal Tailwind hardcode bằng token đã có sẵn
trong [`game-colors.ts`](../../../apps/backoffice/src/lib/game-colors.ts) — **chỉ khi giá trị
literal trùng byte-for-byte** với token tương ứng. Đây là refactor DRY thuần túy (gọi lại hàm đã
có thay vì chép tay), không đổi 1 pixel nào.

## 1. Nguyên tắc bắt buộc — AUDIT TRƯỚC, SWAP SAU

Với MỖI file nghi ngờ trùng lặp:

1. Đọc giá trị literal trong component (VD `"from-red-50/90 via-orange-50/70 to-amber-50/50"`).
2. Đọc giá trị tương ứng trong `GAME_COLORS[<game>]` (VD `.gradientFrom + " " + .gradientVia +
   " " + .gradientTo`).
3. **So sánh string chính xác** (khoảng trắng, thứ tự, opacity `/90` `/70` `/50`).
4. Chỉ khi khớp 100% → swap sang gọi `getGameColors(gameProduct)` hoặc `GAME_COLORS[GameProduct.X]`
   rồi dùng `.gradientFrom`/`.gradientVia`/`.gradientTo`/`.gradientFromDark`/…
5. Nếu KHÔNG khớp (dù chỉ lệch opacity hay thứ tự stop) → **không sửa ở đây**, đưa vào danh sách
   "lệch nhẹ" báo cho track VISUAL xem xét (có thể là bug từ trước, hoặc chủ đích khác cho page đó).

## 2. Danh sách file đã xác nhận khớp (từ khảo sát 19/09/2026)

| File | Game | Literal hiện tại | Token tương ứng |
|---|---|---|---|
| [`power655/jackpot/_lib/jackpot-overview-section.tsx`](../../../apps/backoffice/src/app/(main)/games/power655/jackpot/_lib/jackpot-overview-section.tsx) L50-52 | Power655 | `from-red-50/90 via-orange-50/70 to-amber-50/50` + dark variant | `GAME_COLORS[Power655].gradientFrom/Via/To` + dark |
| [`lotto535/jackpot/_lib/jackpot-overview-section.tsx`](../../../apps/backoffice/src/app/(main)/games/lotto535/jackpot/_lib/jackpot-overview-section.tsx) | Lotto535 | tương tự pattern amber/orange | `GAME_COLORS[Lotto535].gradient*` |
| [`mega645/jackpot/_lib/jackpot-overview-section.tsx`](../../../apps/backoffice/src/app/(main)/games/mega645/jackpot/_lib/jackpot-overview-section.tsx) | Mega645 | teal/cyan/emerald | `GAME_COLORS[Mega645].gradient*` |

**Mở rộng khảo sát (chưa audit chi tiết — làm khi thực thi, theo đúng quy trình §1):** grep tìm
thêm ứng viên bằng:
```bash
rg -l 'from-red-50|from-teal-50|from-amber-50|from-violet-50|from-fuchsia-50|from-lime-50|from-sky-50' \
  apps/backoffice/src --glob '*.tsx'
```
Kết quả sơ bộ gồm cả các file `create-draw-action.tsx` (7 game, dưới
`operations/_lib/sections/draw-management/draw-actions/`) và `draw-command-center.tsx` — audit
từng file theo đúng quy trình §1 trước khi swap, KHÔNG giả định tất cả đều khớp 100%.

## 3. Cách swap — import đúng chỗ

```tsx
// SAI — hardcode lặp lại giá trị đã có trong game-colors.ts
<div
  className={cn(
    "relative overflow-hidden rounded-2xl border-2 p-6",
    "bg-linear-to-br from-red-50/90 via-orange-50/70 to-amber-50/50",
    "dark:from-red-950/50 dark:via-orange-950/40 dark:to-amber-950/30",
    ...
  )}
>

// ĐÚNG — gọi lại token, xoá literal trùng
import { GAME_COLORS } from "@/lib/game-colors";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";

const c = GAME_COLORS[GameProduct.Power655];

<div
  className={cn(
    "relative overflow-hidden rounded-2xl border-2 p-6",
    "bg-linear-to-br", c.gradientFrom, c.gradientVia, c.gradientTo,
    c.gradientFromDark, c.gradientViaDark, c.gradientToDark,
    ...
  )}
>
```

Với các đoạn border/text màu game khác trong cùng file (VD `border-red-300 dark:border-red-700/60`,
`text-red-700/70 dark:text-red-400/60`) — audit riêng từng đoạn theo §1; nếu KHÔNG có token sẵn
khớp (VD opacity `/70`, `/60` không có trong `GameColorTokens` hiện tại) → **không tự thêm field
mới vào `game-colors.ts` ở phase này** (đó là quyết định mở rộng interface, thuộc track VISUAL nếu
cần) — để nguyên literal đó, chỉ swap phần đã chứng minh khớp.

## 4. Quy trình

1. Audit toàn bộ ứng viên (lệnh grep §2) → lập danh sách file + đoạn code khớp/không khớp.
2. Swap từng file đã khớp, 1 file 1 commit logic (dễ revert nếu phát hiện sai).
3. `git diff <file>` — xác nhận **chỉ đổi cách viết class, giá trị cuối cùng render giống cũ**
   (so sánh string thủ công giữa literal cũ và token mới, đã làm ở bước audit).
4. `oxlint <file>` — xác nhận hết warning `no-raw-colors` ở đúng dòng đó.
5. Cuối phase: `pnpm --filter @megawin/backoffice test:e2e` — nếu file sửa nằm trong phạm vi Ops
   Hub Keno/Bingo18, PHẢI xanh 0 diff. Với các game khác (Power655, Lotto535, Mega645... không có
   baseline) — không có gì để so, nhưng vẫn phải tự tin vì đã audit byte-for-byte ở bước 1.

## 5. Output mong đợi

- Giảm đáng kể `no-raw-colors` ở các file jackpot hero + draw-action panel đã audit khớp.
- Danh sách "lệch nhẹ không audit được" (nếu có) chuyển sang
  [`backoffice-visual-color-redesign/p1-01-game-color-simplification.md`](../backoffice-visual-color-redesign/p1-01-game-color-simplification.md)
  để xử lý có chủ đích (không lén sửa ở track an toàn).
</contents>
