# Max 3D — Tổng quan

> **Số liệu trong tài liệu này:** tài liệu chỉ mô tả cơ chế. Mọi con số (mệnh giá, tiền giải, tỷ
> lệ, ngưỡng, giờ quay) PHẢI lấy bằng `getGameConfig` cho game này trong chính lượt trả lời.
> Không dùng số của Vietlott, không dùng số nhớ.

## Tổng quan

Max 3D là game xổ số tự chọn dùng **bộ ba số** (3 chữ số, từ "000" đến "999") — khác hoàn toàn
mô hình "chọn N số từ tập M" của Keno/Lotto 5/35/Mega 6/45/Power 6/55. Lịch quay (những ngày nào
trong tuần, giờ quay) là **cấu hình** — tra `getGameConfig` section `play`.
<!-- structural: dải bộ ba số 000-999 là bản chất game 3 chữ số, không phải config -->

Mỗi kỳ hệ thống quay ra **20 bộ ba số**, chia thành 4 nhóm giải: Đặc Biệt (2 bộ), Nhất (4 bộ),
Nhì (6 bộ), Ba (8 bộ) — tổng 20 bộ.
<!-- structural: cơ cấu 20 bộ ba số theo nhóm giải là cơ chế quay, không phải config -->

1 vé có thể chứa nhiều board (số board tối đa tra `getGameConfig` section `play` — KHÔNG giả định).
Mỗi board chọn 1 trong 2 chế độ chơi độc lập nhau:

- **Max 3D Cơ Bản (chế độ `basic`)**: chọn 1 bộ ba số, có 3 cách chơi (khớp đúng thứ tự, tổ hợp
  3, tổ hợp 6). Chi tiết `how-to-play.md`.
- **Max 3D+ (chế độ `plus`)**: chọn 2 bộ ba số cùng lúc, chỉ hỗ trợ khớp đúng thứ tự nhưng có 7
  hạng giải và luật gộp giải phức tạp hơn. Chi tiết `how-to-play.md` và `payout.md`.

Max 3D **không có Jackpot tích luỹ** — toàn bộ giải thưởng cố định theo bảng cấu hình.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Mệnh giá 1 lần tham gia dự thưởng | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ mỗi board | `getGameConfig` section `play` |
| Số board tối đa 1 vé, số kỳ liên tiếp tối đa | `getGameConfig` section `play` |
| Đóng bán trước giờ quay, ngày quay trong tuần, giờ quay | `getGameConfig` section `play` |
| Hoa hồng đại lý mặc định hệ thống | `getGameConfig` section `rates` |

## Câu hỏi thường gặp của nhân viên

- "Max 3D quay ngày nào?" → `getGameConfig` section `play`.
- "1 vé Max 3D tối đa mấy board?" → `getGameConfig` section `play`, field
  `maxBoardsPerTicket`.
- "Max 3D có Jackpot không?" → Không, toàn bộ giải thưởng cố định.

## Lưu ý dễ sai

- Max 3D **không có** tỷ lệ công ty thu riêng — chỉ có hoa hồng đại lý mặc định hệ thống, giống
  Keno và Bingo 18. Toàn bộ phần còn lại sau giải thưởng + hoa hồng là lợi nhuận công ty, không
  tách riêng phần "công ty thu".
- 2 chế độ chơi (Cơ Bản và Plus) có **2 bộ hạng giải hoàn toàn khác nhau** (4 hạng vs 7 hạng) và
  **2 quy tắc gộp giải khác nhau** — không dùng chung logic, xem chi tiết ở `payout.md`.
- Bộ ba số là **string zero-padded 3 ký tự** (VD "007", "096"), không phải số nguyên.
