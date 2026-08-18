# Power 6/55 — Tổng quan

> **Số liệu trong tài liệu này:** tài liệu chỉ mô tả cơ chế. Mọi con số (mệnh giá, tiền giải, tỷ
> lệ, ngưỡng, giờ quay, số Jackpot) PHẢI lấy bằng `getGameConfig`/`getGameJackpot` cho game này
> trong chính lượt trả lời. Không dùng số của Vietlott, không dùng số nhớ.

## Tổng quan

Power 6/55 là game xổ số tự chọn lớn nhất trong hệ thống, có **2 giải Jackpot tích luỹ song
song** (Jackpot 1 và Jackpot 2) và **bonus number**. Người chơi chọn **6 số** trong tập 01-55.
Lịch quay (những ngày nào trong tuần, giờ quay từng kỳ) là **cấu hình** — tra `getGameConfig`
section `play`.
<!-- structural: không gian số Power 6/55 — cố định theo tên game, không phải config -->

Sau khi hệ thống rút 6 số kết quả chính, rút thêm **1 bonus number** từ 49 quả bóng còn lại
(luôn khác 6 số chính). Bonus number là điều kiện phân biệt giữa Giải Nhất và Jackpot 2 khi trùng
5/6 số.

1 vé có thể chứa nhiều board, mỗi board là 1 lựa chọn độc lập, có thể chơi cho nhiều kỳ liên tiếp
cùng lúc. Số board tối đa 1 vé và số kỳ liên tiếp tối đa đều là **cấu hình** — tra `getGameConfig`
section `play`, KHÔNG giả định.

## Cơ chế 2 Jackpot song song

- **Jackpot 1**: trúng khi trùng đủ 6/6 số chính.
- **Jackpot 2**: trúng khi trùng đúng 5/6 số chính **và** số còn lại trùng bonus number.

Mỗi kỳ, phần đóng góp Jackpot chung được **chia theo tỷ lệ cố định** cho JP1 và JP2 (JP1 nhận
phần lớn hơn nhiều). Khi JP1 tích luỹ vượt 1 ngưỡng cấu hình mà kỳ đó không ai trúng JP1 nhưng có
người trúng JP2, phần vượt ngưỡng của JP1 được chuyển sang trả thêm cho người trúng JP2 kỳ đó
(cơ chế "overflow") — chi tiết đầy đủ 3 trường hợp xem `payout.md`.

Power 6/55, giống Mega 6/45, **không có cơ chế chia giải (split cycle)** xuống các hạng dưới khi
không ai trúng Jackpot — chỉ có cơ chế overflow giữa JP1 và JP2 kể trên.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Giá 1 lần tham gia dự thưởng (1 line) | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ mỗi board | `getGameConfig` section `play` |
| Số board tối đa 1 vé, số kỳ liên tiếp tối đa | `getGameConfig` section `play` |
| Đóng bán trước giờ quay, ngày quay trong tuần, giờ quay | `getGameConfig` section `play` |
| Số tiền khởi điểm mỗi cycle của JP1, JP2 (seed) | `getGameConfig` section `jackpot` |
| Tỷ lệ JP1/JP2 nhận từ phần tích luỹ mỗi kỳ | `getGameConfig` section `jackpot` |
| Ngưỡng overflow của JP1 | `getGameConfig` section `jackpot` |
| Số dư Jackpot 1, Jackpot 2 hiện tại (live) | `getGameJackpot` — **không** dùng `seedAmount` |

## Câu hỏi thường gặp của nhân viên

- "Jackpot 1 và Jackpot 2 hiện đang bao nhiêu?" → `getGameJackpot`, trả về cả 2 số dư riêng biệt.
- "Power 6/55 có bao nhiêu board tối đa?" → `getGameConfig` section `play`, field
  `maxBoardsPerTicket`.
- "Power 6/55 có chia giải Jackpot xuống Giải Nhất không?" → Không — chỉ có cơ chế overflow giữa
  JP1 và JP2, không chia xuống các hạng cố định.

## Lưu ý dễ sai

- Bonus number **không thể** trùng với 6 số kết quả chính (luôn rút từ 49 số còn lại) — vì vậy 1
  line trúng đủ 6/6 (JP1) sẽ **không bao giờ** đồng thời trúng JP2 (khác biệt với 1 board chơi
  bao, có thể trúng cả JP1 và JP2 qua các line khác nhau).
- Power 6/55 **không có** cơ chế chia giải theo ngưỡng như Lotto 5/35 — cơ chế đặc thù
  của Power 6/55 là "overflow" giữa JP1/JP2, khác hoàn toàn "split cycle".
- Vé đã thanh toán (paid) **không sửa được** board/số kỳ chơi.
