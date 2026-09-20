# P1-02 — Hợp nhất màu status badge (Draw/Ticket/Entry × 7 game = 17 file)

## Status (2026-09-19) — DONE

Commit `9d2b7e13`. `status-badge-tone.ts` chỉ còn `TONE_CLASS` semantic; 4 token mới
`status-active/pending/progress/published` trong `globals.css`; 17 call site đã chuyển;
`useSemantic` / `TONE_CLASS_LEGACY` đã xoá ở bước dọn cuối.

**Tiền đề (19/09/2026):** phần "gom 17 file về 1 nơi định nghĩa" đã tách sang track AN TOÀN —
[`backoffice-lint-color-cleanup/p0-05-status-badge-tone-centralize.md`](../backoffice-lint-color-cleanup/p0-05-status-badge-tone-centralize.md)
— vì đó là refactor DRY thuần túy (dedup literal, giữ đúng giá trị), không đổi pixel. File này
giờ CHỈ còn phần thực sự đổi UI: đổi `TONE_CLASS` trong `status-badge-tone.ts` từ literal
(`bg-green-100 text-green-700...`) sang token semantic (`bg-profit/15 text-profit...`).

## 1. Hiện trạng sau P0-05

`apps/backoffice/src/components/games/shared/status-badge-tone.ts` đã tồn tại, export
`StatusBadgeTone` + `statusBadgeToneClass()`, `TONE_CLASS` đang giữ literal Tailwind cũ
(byte-identical với 17 file gốc). 17 file `{draw,ticket,entry}-status-badge.tsx` đã trỏ về hàm
này cho mọi case khớp tone. Phần label/status key của từng game GIỮ NGUYÊN — không đổi ở phase
này (khác biệt nghiệp vụ thật, xem `00-overview.md` §2.2).

Nếu P0-05 phát hiện case lệch tone giữa vài game (ghi chú `// TODO track VISUAL` trong code) —
đọc lại các ghi chú đó trước khi bắt đầu phase này, quyết định tone đúng cho case lệch (có thể
cần hỏi user nếu không rõ ý định gốc).

## 2. Vì sao đây là track VISUAL, không phải an toàn

`bg-profit/15 text-profit` (opacity blend trên token `--profit` = emerald-600) **không** cho ra
đúng pixel giống `bg-emerald-100 text-emerald-700` — 2 công thức màu khác nhau (color-mix vs solid
shade riêng của Tailwind). Gần giống nhưng không byte-identical → phải coi là đổi UI, cần review
ảnh trước/sau theo quy trình chung của track này.

## 3. Rollout — centralize ở P0-05 làm mất khả năng đổi per-game tự nhiên, cần bù lại

Vì `TONE_CLASS` giờ nằm ở 1 file dùng chung cho cả 17 file/7 game, sửa thẳng `TONE_CLASS` sẽ đổi
UI **toàn bộ 7 game cùng lúc** — vi phạm nguyên tắc "1 game/1 lần" của track này (`00-overview.md`
§1.1). Để giữ rollout theo game, làm tạm 2 map song song trong lúc chuyển tiếp:

```typescript
// Giữ map cũ (literal, từ P0-05) — dùng cho game CHƯA duyệt ảnh.
const TONE_CLASS_LEGACY: Record<StatusBadgeTone, string> = { /* ...từ P0-05... */ };

// Map mới (token semantic) — dùng cho game ĐÃ duyệt ảnh.
const TONE_CLASS_SEMANTIC: Record<StatusBadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  positive: "bg-profit/15 text-profit dark:bg-profit/25",
  warning: "bg-warning/15 text-warning dark:bg-warning/25",
  negative: "bg-destructive/15 text-destructive dark:bg-destructive/25",
  info: "bg-info/15 text-info dark:bg-info/25",
};

/** `useSemantic`: true cho game đã duyệt ảnh, false = giữ nguyên literal cũ (đang rollout dần). */
export function statusBadgeToneClass(
  tone: StatusBadgeTone,
  options?: { pulse?: boolean; useSemantic?: boolean },
): string {
  const base = options?.useSemantic ? TONE_CLASS_SEMANTIC[tone] : TONE_CLASS_LEGACY[tone];
  return options?.pulse ? `${base} animate-pulse` : base;
}
```

Mỗi file game truyền `useSemantic: true` khi ĐÃ duyệt ảnh cho game đó — 17 file gốc không cần đổi
gì khác. Sau khi cả 7 game xong (mọi call-site đều `useSemantic: true`), xoá tham số + `TONE_CLASS_
LEGACY`, chỉ còn 1 map (dọn code, không đổi UI ở bước dọn cuối này).

## 4. Quy trình rollout

1. Sửa `status-badge-tone.ts` theo §3 (thêm map song song — chưa đổi UI vì mọi call-site vẫn
   `useSemantic: false`/mặc định).
2. Chọn 1 game đầu tiên (đề xuất Max3D — không có baseline Ops Hub, ít rủi ro nhất) — đổi cả 3
   file `draw/ticket/entry-status-badge.tsx` của game đó, truyền `useSemantic: true`.
3. Chụp ảnh mọi màn hình có hiển thị badge của game đó (list vé, list kỳ quay, ticket detail) —
   trước/sau, trình user duyệt.
4. Sau duyệt: lặp lại cho 4 game còn có ticket/entry (mega645, power655, lotto535, max3dpro), rồi
   `draw-status-badge.tsx` riêng cho keno/bingo18 (không có ticket/entry).
5. Sau khi cả 7 game xong: xoá `useSemantic` param + `TONE_CLASS_LEGACY`, chỉ giữ
   `TONE_CLASS_SEMANTIC` (dọn code cuối, không đổi UI).
6. Mỗi game xong: `oxlint <3 file>` xác nhận giảm `no-raw-colors`, thêm Playwright screenshot spec
   nếu page đó thuộc nhóm quan trọng (§3 overview).

## 5. Case đặc biệt cần xử riêng, không rơi vào tone chung

- `AWAITING_RESETTLE` trong `max3d/draw-status-badge.tsx` (và tương tự ở game khác nếu có) — label
  đặc biệt "Chờ kết sổ lại" với màu cam đậm hơn `settling` bình thường — audit xem có game nào
  khác có logic tương tự (`awaitingResettle` prop) trước khi quyết định tone (`warning` hay cần 1
  biến thể riêng "warning đậm").
- `animate-pulse` trên `drawing`/`settling`/`voiding` — giữ nguyên qua param `pulse` của
  `statusBadgeToneClass`, không bỏ mất hiệu ứng.
</contents>
