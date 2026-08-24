# Keno — Tổng quan

> **Số liệu trong tài liệu này:** tài liệu chỉ mô tả cơ chế. Mọi con số (mệnh giá, tiền giải,
> tỷ lệ, ngưỡng, giờ quay) PHẢI lấy bằng `getGameConfig` cho game này **trong chính lượt trả
> lời**. Không dùng số của Vietlott, không dùng số nhớ, không dùng lại số của lượt trước.

## Tổng quan

Keno là game xổ số tự chọn quay số nhanh, tần suất quay rất cao (nhiều kỳ mỗi giờ, hoạt động
gần suốt cả ngày). Mỗi kỳ hệ thống quay ngẫu nhiên **20 số** từ tập **01-80**.

Người chơi chọn từ 1 đến 10 số trong tập 01-80 (cách chơi cơ bản), hoặc đặt cược vào 2 loại
side bet dựa trên đặc điểm của 20 số quay: **Lớn/Nhỏ** và **Chẵn/Lẻ**. Cách chơi cơ bản và side
bet đều nằm chung trong danh sách board của 1 vé — vé Keno có thể trộn tự do các board: board chơi
cơ bản, board chơi Lớn/Nhỏ, board chơi Chẵn/Lẻ. Số board tối đa 1 vé là **cấu hình** — tra
`getGameConfig` section `play`.
<!-- structural: dải pick 1-10, tập 01-80 và 20 số quay là cơ chế Keno -->

**Keno KHÔNG có Jackpot tích luỹ** — mọi giải thưởng đều cố định theo bảng, có kèm trần trả
thưởng ở các bậc chọn nhiều số (xem `payout.md`).

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Mệnh giá 1 lần tham gia dự thưởng | `getGameConfig` section `play` |
| Số lần cược tối thiểu/tối đa mỗi board | `getGameConfig` section `play` |
| Số board tối đa trên 1 vé | `getGameConfig` section `play` |
| Số kỳ liên tiếp tối đa | `getGameConfig` section `play` |
| Đóng bán trước giờ quay (tính bằng giây) | `getGameConfig` section `play` |
| Khoảng cách giữa các kỳ quay, giờ quay đầu/cuối trong ngày, timezone | `getGameConfig` section `play` |
| Hoa hồng đại lý mặc định hệ thống | `getGameConfig` section `rates` |
| Ngưỡng cảnh báo vận hành (cược lớn, exposure, lệch side bet, dồn combo) | `getGameConfig` section `ops` |

## Câu hỏi thường gặp của nhân viên

- "Keno quay mấy phút 1 lần, mấy giờ đóng bán?" → `getGameConfig` section `play`, đọc
  `drawIntervalMinutes`/giờ quay đầu-cuối và mốc đóng bán trước giờ quay (đơn vị giây).
- "1 vé Keno tối đa mấy board, chơi tối đa mấy kỳ liên tiếp?" → `getGameConfig` section `play`.
- "Đóng bán trước bao lâu?" → đơn vị là **giây**, không phải phút (khác các game jackpot).

## Lưu ý dễ sai

- Keno **không có** tỷ lệ công ty thu riêng — chỉ có hoa hồng đại lý mặc định hệ thống. Sau khi
  trả giải thưởng và hoa hồng, toàn bộ phần còn lại là lợi nhuận công ty, không tách riêng phần
  "công ty thu" như 3 game có Jackpot.
- Đóng bán trước giờ quay của Keno đo bằng **giây** (`salesCloseBeforeSeconds`), không phải phút
  như Lotto 5/35, Mega 6/45, Power 6/55, Max 3D, Max 3D Pro.
- "Panel" trong tài liệu Vietlott gốc = "board" trong hệ thống MegaWin — dùng thuật ngữ `board`
  cho nhất quán khi trả lời.
