# Mega 6/45 — Tổng quan

> **Số liệu trong tài liệu này:** tài liệu chỉ mô tả cơ chế. Mọi con số (mệnh giá, tiền giải, tỷ
> lệ, ngưỡng, giờ quay, số Jackpot) PHẢI lấy bằng `getGameConfig`/`getGameJackpot` cho game này
> trong chính lượt trả lời. Không dùng số của Vietlott, không dùng số nhớ.

## Tổng quan

Mega 6/45 là game xổ số tự chọn, đơn giản hơn Lotto 5/35 vì **không có số đặc biệt**. Người chơi
chọn **6 số** trong tập 01-45. Lịch quay (những ngày nào trong tuần, giờ quay từng kỳ) là **cấu
hình** — tra `getGameConfig` section `play`.
<!-- structural: không gian số Mega 6/45 — cố định theo tên game, không phải config -->

1 vé có thể chứa nhiều board, mỗi board là 1 lựa chọn độc lập, có thể chơi cho nhiều kỳ liên tiếp
cùng lúc. Số board tối đa 1 vé và số kỳ liên tiếp tối đa đều là **cấu hình** — tra `getGameConfig`
section `play`, KHÔNG giả định. Mega 6/45 là 1 trong 3 game có **Jackpot tích luỹ** (cùng Lotto 5/35,
Power 6/55), nhưng **khác biệt quan trọng**: Mega 6/45 **không có cơ chế chia giải** — khi không
ai trúng Jackpot, toàn bộ số dư luôn cộng dồn sang kỳ tiếp theo, không có ngưỡng kích hoạt chia
xuống các hạng dưới.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Đơn giá 1 line | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ mỗi board | `getGameConfig` section `play` |
| Số board tối đa 1 vé, số kỳ liên tiếp tối đa | `getGameConfig` section `play` |
| Đóng bán trước giờ quay, ngày quay trong tuần, giờ quay | `getGameConfig` section `play` |
| Số tiền khởi điểm 1 cycle Jackpot mới (seed) | `getGameConfig` section `jackpot` |
| Số Jackpot đang tích luỹ (live) | `getGameJackpot` — **không** dùng `seedAmount` |

## Câu hỏi thường gặp của nhân viên

- "Mega 6/45 quay ngày nào, mấy giờ?" → `getGameConfig` section `play`, phần lịch quay (ngày
  trong tuần + giờ quay).
- "Jackpot Mega 6/45 hiện đang bao nhiêu?" → `getGameJackpot`, KHÔNG dùng mức khởi điểm cấu hình.
- "Mega 6/45 có chia giải Jackpot không?" → Không, khác Lotto 5/35 — Jackpot chỉ tích luỹ tuyệt
  đối, không có cơ chế chia xuống Giải Nhất/Nhì/Ba.

## Lưu ý dễ sai

- Mega 6/45 **không có** `splitThreshold`/`splitRatios` trong config — đây là khác biệt cố ý so
  với Lotto 5/35 và Power 6/55, không phải thiếu sót dữ liệu.
- Vé đã thanh toán (paid) **không sửa được** board/số kỳ chơi — mọi thay đổi sau đó xử lý ở cấp
  entry (hủy kỳ, kết sổ lại), không sửa vé gốc.
