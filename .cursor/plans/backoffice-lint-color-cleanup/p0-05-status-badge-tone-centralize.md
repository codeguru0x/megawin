# P0-05 — Centralize literal màu status badge (KHÔNG đổi token, KHÔNG đổi pixel)

**Tách ra từ `p1-02-status-badge-unification.md` (track VISUAL) sau khi xác nhận với user
19/09/2026** — phần "gom 17 file về 1 nơi" là byte-safe, chỉ phần "đổi literal → token opacity"
mới thực sự đổi pixel. Phase này CHỈ làm phần byte-safe.

## 1. Vấn đề — DRY, không phải màu

17 file `apps/backoffice/src/components/games/<game>/{draw,ticket,entry}-status-badge.tsx` mỗi
file tự viết `STATUS_MAP: Record<string, { label, className }>` với cùng pattern màu
(`bg-{color}-100 text-{color}-700 dark:bg-{color}-900 dark:text-{color}-300`) lặp lại nhiều lần
cho cùng tone nghĩa (VD "tích cực" = emerald, xuất hiện ở `paid`, `settled`, `completed`,
`active`, `salesOpen`... rải khắp 17 file). oxlint tính `no-raw-colors` theo từng occurrence
literal → gom về 1 nơi giảm warning bằng dedup, không đổi giá trị.

## 2. Giải pháp — file tone dùng LITERAL HIỆN TẠI (chưa đổi sang `profit`/`warning`/`info`)

Tạo `apps/backoffice/src/components/games/shared/status-badge-tone.ts`:

```typescript
/**
 * Tone màu dùng chung cho mọi status badge (Draw/Ticket/Entry) trên 7 game.
 *
 * Định nghĩa MỘT LẦN — 17 file status-badge.tsx dẫn tới đây thay vì viết tay
 * `bg-{color}-100 text-{color}-700 dark:...` lặp lại. Giữ NGUYÊN status key/label
 * riêng từng game (khác biệt nghiệp vụ thật, không phải trùng lặp cần gộp).
 *
 * Giá trị dưới đây là LITERAL HIỆN TẠI copy nguyên từ code cũ — CHƯA đổi sang token
 * semantic (`profit`/`warning`/`info`/`destructive`). Việc đổi sang token là bước
 * riêng ở track VISUAL (xem `p1-02-status-badge-unification.md`) vì đổi token sẽ đổi
 * pixel (opacity blend khác solid shade), cần review ảnh. Phase này KHÔNG đổi 1 pixel.
 */
export const StatusBadgeTone = {
  Neutral: "neutral",
  Positive: "positive",
  Warning: "warning",
  Negative: "negative",
  Info: "info",
} as const;
export type StatusBadgeTone = (typeof StatusBadgeTone)[keyof typeof StatusBadgeTone];

const TONE_CLASS: Record<StatusBadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  positive: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  negative: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
};

/** Class cho badge tone, kèm `animate-pulse` khi trạng thái đang diễn ra (drawing, settling...). */
export function statusBadgeToneClass(tone: StatusBadgeTone, pulse = false): string {
  return pulse ? `${TONE_CLASS[tone]} animate-pulse` : TONE_CLASS[tone];
}
```

**QUAN TRỌNG:** giá trị `TONE_CLASS` ở trên là placeholder minh hoạ — khi thực thi PHẢI đọc lại
đúng literal đang dùng ở từng file (VD có thể là `emerald` không phải `green`, `amber` không phải
`yellow` — audit như quy trình P0-04 §1, không đoán). Nếu 17 file dùng **không hoàn toàn giống
nhau** cho cùng tone (VD 1 file dùng `emerald-100`, file khác dùng `green-100` cho cùng ý nghĩa
"tích cực") → đây là bằng chứng lệch nhẹ đã có từ trước, PHẢI hỏi lại / ghi chú rõ trong danh sách
"lệch không audit được" thay vì tự chọn 1 giá trị đại diện (tự chọn = đã đổi pixel ở ít nhất 1
game, vi phạm nguyên tắc byte-safe của track này).

## 3. Quy trình

1. Đọc đủ 17 file, lập bảng: file × status key × tone nghĩa × literal className hiện tại.
2. Nhóm theo tone nghĩa (Neutral/Positive/Warning/Negative/Info) — xác nhận literal khớp
   byte-for-byte trong cùng nhóm. Nếu lệch (§2) → tách riêng, không gộp cưỡng ép.
3. Nếu MỌI literal trong 1 nhóm khớp nhau → dùng đúng giá trị đó cho `TONE_CLASS` tương ứng.
4. Nếu có nhóm lệch → vẫn tạo `TONE_CLASS` theo giá trị PHỔ BIẾN NHẤT trong nhóm, còn lại giữ
   nguyên literal tại file đó (không gọi `statusBadgeToneClass`) + ghi chú `// TODO track VISUAL:
   lệch tone, xem p0-05 audit note` — không tự sửa cho khớp (đó là đổi pixel).
5. Sửa từng file: import `statusBadgeToneClass`, thay `className: "bg-...`" bằng
   `className: statusBadgeToneClass(StatusBadgeTone.X, pulse?)` — **chỉ** với case đã xác nhận
   khớp 100% ở bước 3.
6. `git diff <file>` — xác nhận class cuối cùng render **giống ký tự với literal cũ** (so sánh
   string, không chỉ nhìn "trông giống").
7. `oxlint <file>` — xem `no-raw-colors` giảm đúng số dòng đã swap.
8. Cuối phase: `pnpm --filter @megawin/backoffice test:e2e` (Ops Hub Keno/Bingo18) — PHẢI xanh
   0 diff, vì Keno/Bingo18 nằm trong 17 file này (`draw-status-badge.tsx`).

## 4. Bàn giao cho track VISUAL

Sau phase này, `status-badge-tone.ts` đã tồn tại với literal hiện tại + danh sách case lệch
(nếu có). `p1-02-status-badge-unification.md` build tiếp trên nền này — chỉ còn việc đổi
`TONE_CLASS` từ literal sang token semantic (`bg-profit/15 text-profit`...), không cần viết lại
17 file gọi hàm (đã trỏ đúng chỗ từ phase này).
