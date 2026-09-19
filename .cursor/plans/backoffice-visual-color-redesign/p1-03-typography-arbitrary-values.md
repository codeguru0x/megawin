# P1-03 — Non-typography arbitrary values (border/ring/shadow/width...)

**ĐÃ ĐẢO QUYẾT ĐỊNH (19/09/2026):** phần `text-[11px]`/`text-[10px]` (~578 warning, phần lớn của
648) đã được xử lý ở track AN TOÀN —
[`backoffice-lint-color-cleanup/p0-06-typography-named-tokens.md`](../backoffice-lint-color-cleanup/p0-06-typography-named-tokens.md)
— bằng named token `text-2xs`/`text-3xs` giữ ĐÚNG pixel hiện tại (Hướng A), sau khi phát hiện
xung đột: `operations-page-ui.mdc` đã document T4(11px)/T5(10px) là tier CÓ CHỦ ĐÍCH cho heatmap
grid, "Hướng B" (chuẩn hoá lên 12px) sẽ **phá vỡ** rule đã publish thay vì tuân theo. Quyết định
"Hướng B" trước đó trong file này đã **không còn hiệu lực** — xem ghi chú lịch sử ở cuối file.

File này giờ **chỉ còn phạm vi non-typography arbitrary** (border/ring/shadow/width...) — phần
còn lại của 648 sau khi trừ ~578 đã xử ở P0-06.

## 1. Phạm vi còn lại — chỉ non-typography

Sau P0-06, warning `no-arbitrary-values` chỉ còn phần **không phải** `text-[11px]`/`text-[10px]`
— border/ring/shadow/width/gap... viết bằng cú pháp arbitrary thay vì scale chuẩn Tailwind
(VD `border-[1.5px]`, `w-[137px]`, `gap-[6px]`). Đây thực sự là 1 phần nhỏ của 648 (ước tính
~70, cần đo lại bằng oxlint sau khi P0-06 xong).

## 2. Vì sao vẫn ở track VISUAL

Không giống typography (nơi named token giữ đúng pixel cũ), border/width/gap arbitrary thường
KHÔNG có sẵn scale Tailwind khớp chính xác giá trị hiện tại (VD `w-[137px]` không map đúng bất kỳ
`w-*` chuẩn nào) — đổi về scale gần nhất (`w-36`=144px hoặc `w-34`=136px...) **sẽ đổi pixel**,
cần review ảnh per-file.

## 3. Quy trình rollout

1. `oxlint apps/backoffice --format=unix | grep no-arbitrary-values` (sau khi P0-06 xong) — lấy
   danh sách chính xác các occurrence còn lại + file.
2. Với mỗi occurrence: đọc giá trị hiện tại, tìm scale Tailwind chuẩn gần nhất, đánh giá mức lệch
   (VD lệch 1px thường an toàn, lệch >4px cần cẩn trọng hơn).
3. Nếu giá trị hiện tại **trùng khớp tuyệt đối** với 1 giá trị trong scale chuẩn (VD `gap-[8px]`
   khi Tailwind có sẵn `gap-2`=8px) → swap thẳng, đây thực chất byte-safe (chỉ đổi cú pháp, không
   đổi số) — có thể làm ngay không cần review ảnh, nhưng vẫn `oxlint`/`git diff` xác nhận.
4. Nếu KHÔNG khớp tuyệt đối → đổi về giá trị gần nhất, chụp ảnh trước/sau, trình user duyệt theo
   đúng Definition of Done ở `00-overview.md` §3 (không suppress, sửa thật).
5. Cập nhật/thêm Playwright screenshot spec cho page bị ảnh hưởng đáng kể.
</contents>
