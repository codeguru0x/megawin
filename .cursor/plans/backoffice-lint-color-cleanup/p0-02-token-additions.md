# P0-02 — Thêm token `--warning`/`--info` vào `globals.css` (thuần additive)

**Mục tiêu:** `@shadcn/lint` message của `no-raw-colors` nhắc tới `warning`/`info` như token hợp
lệ, nhưng đo thực tế `apps/backoffice/src/app/globals.css` **chưa có** `--warning`/`--info` (chỉ
có `--profit`/`--loss`/`--destructive`/`--game-*`/`--chart-1..5`). Đây là việc **thêm mới**, không
sửa gì đang tồn tại → 0 rủi ro lệch UI (không component nào đang dùng class chưa tồn tại).

## 1. Vị trí thêm

File: [`apps/backoffice/src/app/globals.css`](../../../apps/backoffice/src/app/globals.css)

Thêm theo đúng pattern đã có của `profit`/`loss` (3 chỗ: `@theme inline`, `:root`, `.dark`):

```css
/* trong @theme inline, cạnh --color-profit/--color-loss hiện có */
--color-warning: var(--warning);
--color-warning-foreground: var(--warning-foreground);
--color-info: var(--info);
--color-info-foreground: var(--info-foreground);
```

```css
/* trong :root, cạnh --profit/--loss */
/* ── Warning / Info semantic colors ────────────────────────────────────── */
/* Dùng cho cảnh báo (chờ xử lý, gần ngưỡng) và thông tin trung tính.       */
/* Tailwind utility: text-warning, bg-warning, text-info, bg-info           */
--warning: oklch(0.75 0.15 70); /* amber-500 tương đương #f59e0b */
--warning-foreground: oklch(0.2 0.05 70); /* dark text đủ contrast trên nền amber sáng */
--info: oklch(0.6 0.18 250); /* blue-500 tương đương #3b82f6 */
--info-foreground: oklch(1 0 0); /* white */
```

```css
/* trong .dark, cạnh --profit/--loss dark */
--warning: oklch(0.82 0.16 80); /* amber-400 — sáng hơn cho nền tối, tương đương #fbbf24 */
--warning-foreground: oklch(0.15 0.05 70);
--info: oklch(0.72 0.16 250); /* blue-400 — tương đương #60a5fa */
--info-foreground: oklch(0.15 0.05 250);
```

**Lưu ý khi thêm giá trị oklch thật:** không tự chọn số bừa — convert đúng từ hex tương đương đã
ghi trong comment (amber-500 `#f59e0b`, blue-500 `#3b82f6`, amber-400 `#fbbf24`, blue-400
`#60a5fa` — đây là các mã màu Tailwind chuẩn đã dùng rải rác trong code hiện tại cho warning/info,
theo dõi ở P1 track VISUAL để đảm bảo khi migrate call site, màu KHÔNG đổi tông so với hiện tại).
Dùng công cụ convert hex→oklch (VD `culori` hoặc trang oklch.com) để lấy số chính xác, không ước
lượng tay — sai số nhỏ vẫn tính là "đổi màu" nếu áp dụng ở scale lớn.

## 2. KHÔNG làm ở phase này

- KHÔNG đổi bất kỳ component nào sang dùng `text-warning`/`bg-info` — đó là việc của track VISUAL
  (`p1-01`, vì đổi raw amber/blue cụ thể sang token mới **có thể** lệch màu nếu oklch không khớp
  100% giá trị hex gốc đang dùng ở từng nơi).
- KHÔNG xoá `--destructive` hay đổi quan hệ `--loss` = `--destructive` hiện tại.

## 3. Verify

- [ ] `pnpm --filter @megawin/backoffice check-types` xanh (CSS không ảnh hưởng type, chỉ để chắc
      chắn không sửa nhầm file khác).
- [ ] `git diff apps/backoffice/src/app/globals.css` — chỉ thấy các dòng THÊM MỚI, không có dòng
      nào bị xoá/sửa.
- [ ] Build Tailwind không lỗi: `grep -c "warning\|info" apps/backoffice/src/app/globals.css`
      tăng đúng số dòng đã thêm.
- [ ] `test:e2e` (behaviour) xanh — không đổi bất kỳ class nào đang render.
</contents>
