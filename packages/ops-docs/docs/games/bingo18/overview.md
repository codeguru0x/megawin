# Bingo 18 — Tổng quan

> **Số liệu trong tài liệu này:** tài liệu chỉ mô tả cơ chế. Mọi con số (mệnh giá, tiền giải, tỷ
> lệ, ngưỡng, giờ quay) PHẢI lấy bằng `getGameConfig` cho game này trong chính lượt trả lời.
> Không dùng số của Vietlott, không dùng số nhớ.

## Tổng quan

Bingo 18 là game xổ số nhanh dạng xúc xắc — **đơn giản nhất** và **tần suất cao nhất** trong hệ
thống. Mỗi kỳ hệ thống quay ra **3 số** trong tập 1-6 (như 3 viên xúc xắc độc lập, các số có thể
trùng nhau). Tần suất quay rất cao (mỗi vài phút 1 kỳ), hoạt động gần suốt cả ngày, mọi ngày
trong tuần.

Người chơi có 5 cách chơi độc lập, nằm chung trong danh sách board của 1 vé (không tách riêng
"cơ bản" và "bổ sung" như Keno) — 3 cách chơi dựa trên số cụ thể (Một số, Hai số trùng nhau, Ba
số trùng nhau) và 2 cách chơi dựa trên tổng 3 số quay (Cộng tổng, Lớn/Hòa/Nhỏ). Chi tiết
`how-to-play.md`.

Bingo 18 **không có Jackpot tích luỹ** — toàn bộ giải thưởng cố định theo bảng cấu hình.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Mệnh giá 1 lần tham gia dự thưởng | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ mỗi board | `getGameConfig` section `play` |
| Số board tối đa 1 vé | `getGameConfig` section `play` |
| Số kỳ liên tiếp tối đa | `getGameConfig` section `play` |
| Đóng bán trước giờ quay (tính bằng giây) | `getGameConfig` section `play` |
| Khoảng cách giữa các kỳ quay, giờ quay đầu/cuối trong ngày, timezone | `getGameConfig` section `play` |
| Hoa hồng đại lý mặc định hệ thống | `getGameConfig` section `rates` |

## Câu hỏi thường gặp của nhân viên

- "Bingo 18 quay mấy phút 1 lần?" → `getGameConfig` section `play`.
- "1 vé Bingo 18 tối đa mấy board?" → `getGameConfig` section `play`. Không có trần cứng cố định —
  hoàn toàn tuỳ cấu hình, KHÔNG suy từ game khác.
- "Đóng bán trước bao lâu?" → Đơn vị là **giây**, không phải phút như các game jackpot; giá trị tra
  `getGameConfig` section `play`.

## Lưu ý dễ sai

- Bingo 18 **không có** tỷ lệ công ty thu riêng — chỉ có hoa hồng đại lý mặc định hệ thống, giống
  Keno, Max 3D, Max 3D Pro. Toàn bộ phần còn lại sau giải thưởng + hoa hồng là lợi nhuận công ty.
- Đóng bán trước giờ quay đo bằng **giây** (`salesCloseBeforeSeconds`), giống Keno, khác các game
  jackpot đo bằng phút.
- 3 số quay của Bingo 18 **có thể trùng nhau** (độc lập như xúc xắc) — không phải chọn 3 số riêng
  biệt trong 1 tập như các game số khác.
