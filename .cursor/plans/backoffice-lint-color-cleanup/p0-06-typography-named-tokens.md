# P0-06 — `text-[11px]`/`text-[10px]` → named token `text-2xs`/`text-3xs` (KHÔNG đổi pixel)

**Đảo lại quyết định trước đó (đã chốt "Hướng B — chuẩn hoá 12px" trong
`backoffice-visual-color-redesign/p1-03-typography-arbitrary-values.md`) sau khi phát hiện xung đột
với `operations-page-ui.mdc` §"Typography Scale" — rule đã document T4(11px)/T5(10px) là tier CÓ
CHỦ ĐÍCH cho heatmap grid, không phải lỗi cần sửa lên 12px. Đã xác nhận lại với user 19/09/2026:
chọn "Hướng A" — thêm named token giữ đúng giá trị pixel hiện tại.**

## 1. Vì sao đây là track AN TOÀN, không phải VISUAL

`shadcn(no-arbitrary-values)` chỉ chặn **cú pháp** `text-[Npx]` (Tailwind arbitrary value) —
không quan tâm N là bao nhiêu. Thêm 2 theme token mới sinh ra utility class chuẩn
(`text-2xs`, `text-3xs`) với **đúng giá trị pixel hiện tại (11px, 10px)** → hết warning,
0 đổi rendering. Đây khác hoàn toàn với hướng cũ (đổi N từ 11/10 lên 12) — hướng đó đổi pixel
thật, đúng ra phải ở track VISUAL.

## 2. Thêm token vào `globals.css`

Trong [`apps/backoffice/src/app/globals.css`](../../../apps/backoffice/src/app/globals.css)
`@theme inline { ... }` — Tailwind v4 tự sinh utility `text-{name}` từ mọi `--text-{name}`:

```css
@theme inline {
  /* ...existing... */

  /* ── Typography tier T4/T5 — CHỈ dùng cho heatmap grid (xem operations-page-ui.mdc) ──── */
  /* Named token thay arbitrary value — giữ ĐÚNG pixel hiện tại (11px/10px), không đổi thang. */
  --text-2xs: 0.6875rem; /* 11px — T4, heatmap badge + cell data */
  --text-3xs: 0.625rem; /* 10px — T5, heatmap cell sub-text, stepper time */
}
```

Không cần khai `--text-2xs--line-height` — arbitrary value cũ (`text-[11px]`) không ép line-height
riêng, giữ nguyên hành vi (inherit/normal) để không đổi pixel.

## 3. Swap tại nguồn tập trung (2 file token, ưu tiên trước)

[`components/games/shared/game-number-tokens.ts`](../../../apps/backoffice/src/components/games/shared/game-number-tokens.ts):

```typescript
export const HEATMAP_BADGE_TEXT = "text-2xs"; // 11px — T4, không đổi
export const HEATMAP_CELL_DATA_SIZE = "text-2xs"; // 11px — T4, không đổi
export const HEATMAP_CELL_SUB_SIZE = "text-3xs"; // 10px — T5, không đổi
```

[`components/games/lotto535/lotto-number-tokens.ts`](../../../apps/backoffice/src/components/games/lotto535/lotto-number-tokens.ts)
— `LOTTO_NUMBER_SIZE.xs.textClass`: `"text-[10px]"` → `"text-3xs"`.

## 4. Swap toàn bộ ~578 chỗ còn lại (rải rác, không qua token)

Danh sách sơ bộ đã audit ở `p1-03` cũ (giữ nguyên phạm vi khảo sát): `power-number-ball.tsx`,
`mega-number-ball.tsx`, `jackpot-display.tsx`, 5 file `active-draw-card.tsx`, `kpi-card.tsx`,
`outstanding-kpi-strip.tsx`, `payout-ratio.tsx`, `nav-main.tsx`, `search-dialog.tsx`,
`player-name.tsx`, `draw-lifecycle-stepper.tsx`, `draw-id-label.tsx`, và các file heatmap
7 game (`number-heatmap.tsx`) dùng trực tiếp `text-[11px]`/`text-[10px]` không qua token.

Với MỌI file: `text-[11px]` → `text-2xs`, `text-[10px]` → `text-3xs`. **Đây là swap 1:1 thuần cú
pháp, không cần audit "khớp giá trị" như P0-04/P0-05** — vì N không đổi, không có rủi ro lệch giá
trị. Có thể làm bằng find-replace theo pattern, miễn kiểm `git diff` chỉ đổi đúng 2 chuỗi này.

```bash
# Audit đầy đủ trước khi sửa — xác nhận không sót
rg -n 'text-\[11px\]|text-\[10px\]' apps/backoffice/src --glob '*.tsx' --glob '*.ts'
```

## 5. Cập nhật `operations-page-ui.mdc` — đổi cách VIẾT, không đổi Ý

Rule hiện ghi `text-[11px]`/`text-[10px]` là ví dụ token — sau phase này, token thật là
`text-2xs`/`text-3xs`. Cập nhật các dòng sau (giữ nguyên ý nghĩa T4/T5, chỉ đổi cú pháp minh hoạ):

- Dòng 196: `` `text-[11px]` `` → `` `text-2xs` ``
- Dòng 227-230 (code block `game-number-tokens.ts`): đổi giá trị 3 const như §3.
- Dòng 422-426 (bảng Typography Scale): cột "Class" của T4/T5 đổi `text-[11px]`/`text-[10px]`
  thành `text-2xs`/`text-3xs`.
- Dòng 538 (checklist): `` `text-[10px]`/`text-[11px]` ngoài heatmap grid — dùng `text-xs` `` →
  đổi thành `` `text-[Npx]` bất kỳ (arbitrary value) — dùng `text-2xs`/`text-3xs`/`text-xs` theo
  đúng tier ``.

## 6. Vấn đề còn lại — KHÔNG thuộc phạm vi phase này (ghi chú, không tự xử)

Sau khi hết warning `no-arbitrary-values`, có thể phát hiện một số chỗ dùng `text-2xs`/`text-3xs`
(11px/10px) **ngoài context heatmap grid** — đây là vi phạm rule đã có từ TRƯỚC track này (checklist
gốc §538 đã ghi "ngoài heatmap grid phải dùng `text-xs`"), không phải warning oxlint. Đây là nợ
thiết kế riêng, tách hẳn khỏi mục tiêu dọn lint — ghi lại danh sách nếu gặp, KHÔNG tự đổi lên
`text-xs` ở phase này (đổi pixel, cần review ảnh, thuộc quyết định UI riêng nếu user muốn làm sau).

## 7. Quy trình & checklist

1. Thêm token `globals.css` (§2) — additive, chưa ai dùng, 0 rủi ro.
2. Swap 2 file token trung tâm (§3).
3. Audit + swap toàn bộ phần rải rác (§4) — theo lệnh grep, xác nhận hết match.
4. Cập nhật `operations-page-ui.mdc` (§5).
5. `oxlint apps/backoffice --format=unix | grep no-arbitrary-values` — xác nhận nhóm
   `text-[11px]`/`text-[10px]` về 0 (phần còn lại của 648 là non-typography, xem
   `backoffice-visual-color-redesign/p1-03-typography-arbitrary-values.md` đã rút gọn phạm vi).
6. `prettier --write <paths>`.
7. `pnpm --filter @megawin/backoffice test:e2e` (Ops Hub Keno/Bingo18) — PHẢI xanh 0 diff.
