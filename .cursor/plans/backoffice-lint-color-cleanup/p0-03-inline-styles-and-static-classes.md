# P0-03 — `no-inline-styles` (~288) + `require-static-classes` (~86)

**Mục tiêu:** sửa cấu trúc code để pass 2 rule này **mà giá trị style tính toán ra (computed
style) giữ nguyên 100%** — đây là ràng buộc bắt buộc để phase này ở track AN TOÀN.

## 1. `shadcn(no-inline-styles)` — phân loại theo message cụ thể

Lấy danh sách:
```bash
./node_modules/.bin/oxlint apps/backoffice -A all -W 'shadcn(no-inline-styles)' --format=unix > /tmp/inline-styles.txt
rg -o 'Inline style sets \w+' /tmp/inline-styles.txt | sort | uniq -c | sort -rn
```

Từ lần đo trước: `gridTemplateColumns` (59), `width` (54), `borderLeftColor` (23), `color` (21),
`background` (19), `backgroundColor` (11), `maxHeight` (14), `height` (11), `display` (10),
`maxWidth` (8), còn lại nhỏ.

### 1.1. Giá trị ĐỘNG (phụ thuộc runtime data — progress %, board color theo index, v.v.)

Đây là nhóm chiếm đa số (`width` cho progress bar %, `borderLeftColor` từ `boardColorVar()`,
`gridTemplateColumns` từ số cột động). Không thể chuyển sang class Tailwind tĩnh (giá trị chỉ biết
lúc runtime) — chuyển sang **CSS custom property** giữ nguyên đúng giá trị:

```tsx
// SAI (bị lint, nhưng giá trị render giống ĐÚNG sau khi sửa — chỉ đổi cách set)
<div style={{ width: `${pct}%`, background: gradient }} />

// ĐÚNG — cùng giá trị, style qua CSS variable + class
<div
  className="h-full rounded-full transition-all duration-700 ease-out w-[var(--bar-w)] bg-[var(--bar-bg)]"
  style={{ "--bar-w": `${pct}%`, "--bar-bg": gradient } as React.CSSProperties}
/>
```

Với `gridTemplateColumns` (dynamic column count):
```tsx
// SAI
<div style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} />

// ĐÚNG
<div
  className="grid [grid-template-columns:var(--grid-cols)]"
  style={{ "--grid-cols": `repeat(${cols}, minmax(0, 1fr))` } as React.CSSProperties}
/>
```

**Verify bắt buộc mỗi file:** trước/sau, giá trị `style` object truyền vào DOM thực chất **vẫn là
1 CSS custom property gán qua `style`** — engine Tailwind arbitrary `[...]` chỉ đọc lại var đó ở
compile time, browser output identical. Không cần review ảnh — đây là biến đổi tương đương toán
học (inline style trực tiếp ≡ inline custom property + `var()` trong class).

Với `borderLeftColor` từ `boardColorVar(boardNo)` (đã trả về `var(--board-a)` string) — tương tự,
chuyển thành `style={{ "--board-color": boardColorVar(boardNo) }}` + class
`border-l-[var(--board-color)]`.

### 1.2. Giá trị TĨNH bị lint nhầm vì viết dạng object (không phụ thuộc runtime)

Nếu có case `style={{ display: "flex" }}` hay màu cố định không đổi theo data — đây **có thể**
chuyển thẳng sang class Tailwind (`className="flex"`) — value tĩnh, không có rủi ro vì Tailwind
sinh chính xác CSS tương đương. Kiểm tra từng case: nếu giá trị là literal cố định (không có biến
JS nào), đổi sang class tương ứng luôn (không cần CSS variable).

## 2. `shadcn(require-static-classes)` — Badge/Button/TableCell dynamic className

```bash
./node_modules/.bin/oxlint apps/backoffice -A all -W 'shadcn(require-static-classes)' --format=unix
```

Rule này chặn `className={cn(condition && buildDynamicString())}` vì tool không đọc được string
tĩnh nào sẽ render. Fix: liệt kê rõ TỪNG nhánh string tĩnh, để `cn()` chọn giữa các literal —
**không đổi kết quả cuối cùng nào sẽ render** khi liệt kê đủ tất cả nhánh đã có trong hàm cũ.

```tsx
// SAI — tool không đọc được buildDynamic() trả gì
<Badge className={cn(isWin && buildWinClass(tier))} />

// ĐÚNG — liệt kê tường minh (đọc buildWinClass cũ để chép lại ĐÚNG từng nhánh, không tự sáng tác)
<Badge className={cn(isWin && (tier === "gold" ? "text-warning" : "text-profit"))} />
```

**Ràng buộc bắt buộc:** trước khi sửa, ĐỌC hàm build-dynamic-class hiện tại, chép lại **chính xác
từng nhánh** nó có thể trả ra thành literal tường minh. KHÔNG tự đổi giá trị nhánh nào trong lúc
này (đó là việc của track VISUAL nếu giá trị đó là raw color cần migrate — làm ở p1, không trộn
vào đây). Nếu hàm build-dynamic quá phức tạp (nhiều tổ hợp) để liệt kê an toàn — báo lại, không tự
đơn giản hoá logic.

## 3. Quy trình

1. Xử `no-inline-styles` trước (tách theo message loại, mục 1.1 chiếm đa số).
2. Xử `require-static-classes` sau (mục 2, cần đọc kỹ hàm cũ).
3. Sau mỗi ~15-20 file: `oxlint <paths đã sửa>` xác nhận 2 rule này hết ở các file đó.
4. `prettier --write <paths>`.
5. `pnpm --filter @megawin/backoffice test:e2e` — chạy cả visual (Ops Hub Keno/Bingo18) nếu file
   sửa nằm trong phạm vi đó — PHẢI xanh, 0 diff (đổi inline style → CSS var không đổi computed
   style, nên baseline hiện có phải khớp nguyên).

## 4. Output mong đợi

- `no-inline-styles`: 0 (hoặc còn lại rất ít case đặc biệt — báo cụ thể lý do nếu có).
- `require-static-classes`: 0.
- Không file screenshot nào bị đổi (`git status` trong `*-snapshots/` không có gì — vì các file đó
  gitignore, nhưng chạy `test:e2e` phải báo pass, không báo "1 snapshot doesn't match").
</contents>
