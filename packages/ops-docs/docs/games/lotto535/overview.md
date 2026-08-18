# Lotto 5/35 — Tổng quan

> **Số liệu trong tài liệu này:** tài liệu chỉ mô tả cơ chế. Mọi con số (mệnh giá, tiền giải,
> tỷ lệ, ngưỡng, giờ quay, số Jackpot) PHẢI lấy bằng `getGameConfig`/`getGameJackpot` cho game
> này trong chính lượt trả lời. Không dùng số của Vietlott, không dùng số nhớ.

## Tổng quan

Lotto 5/35 là game xổ số tự chọn. Người chơi chọn **5 số chính** trong tập 01-35 và **1 số đặc
biệt** trong tập 01-12 riêng.
<!-- structural: không gian số Lotto 5/35 — cố định theo tên game, không phải config -->

1 vé có thể chứa nhiều board, mỗi board là 1 lựa chọn độc lập, có thể chơi cho nhiều kỳ liên tiếp
cùng lúc. Số board tối đa 1 vé và số kỳ liên tiếp tối đa đều là **cấu hình** — tra `getGameConfig`
section `play`, KHÔNG giả định. Lotto 5/35 là 1 trong 3 game có **Jackpot tích luỹ** (cùng
Mega 6/45, Power 6/55) — Jackpot cộng dồn qua các kỳ chưa có người trúng, và có cơ chế **chia giải**
khi tích luỹ quá lớn mà kỳ chia giải không ai trúng.

Mỗi ngày có nhiều kỳ quay; drawId đánh số thứ tự trong ngày (`.001`, `.002`, …). **Kỳ cuối cùng
trong ngày** là kỳ duy nhất có thể kích hoạt chia giải Jackpot. Số kỳ mỗi ngày và giờ quay từng kỳ
là cấu hình — tra `getGameConfig` section `play`, không suy từ số thứ tự drawId.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Giá 1 line cho 1 kỳ | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ mỗi board | `getGameConfig` section `play` |
| Số board tối đa 1 vé, số kỳ liên tiếp tối đa | `getGameConfig` section `play` |
| Đóng bán trước giờ quay, số kỳ/ngày, giờ quay | `getGameConfig` section `play` |
| Số tiền khởi điểm 1 cycle Jackpot mới (seed) | `getGameConfig` section `jackpot` |
| Ngưỡng kích hoạt chia giải Jackpot | `getGameConfig` section `jackpot` |
| Số Jackpot đang tích luỹ (live) | `getGameJackpot` — **không** dùng `seedAmount` |

## Câu hỏi thường gặp của nhân viên

- "Jackpot Lotto 5/35 hiện đang bao nhiêu?" → `getGameJackpot`, KHÔNG dùng mức khởi điểm cấu hình
  (đó chỉ là mức khởi điểm mỗi cycle mới, không phải số dư hiện tại).
- "1 vé chơi được tối đa mấy kỳ, mấy board?" → `getGameConfig` section `play`.
- "Kỳ nào có thể chia giải Jackpot?" → Kỳ **cuối cùng trong ngày** — xác định bằng phần tử cuối
  danh sách giờ quay ở `getGameConfig` section `play`, không đoán theo tên gọi hay giờ cụ thể.
- "Mỗi ngày quay mấy kỳ, mấy giờ?" → `getGameConfig` section `play`.

## Lưu ý dễ sai

- Ngày tài chính của Lotto 5/35 **không trùng** ngày lịch — mốc cắt là giữa buổi sáng theo giờ Việt
  Nam, không phải nửa đêm. Báo cáo tài chính theo "ngày" dùng mốc này.
  <!-- structural: mốc ngày tài chính là hằng số toàn hệ thống, không thuộc game config -->
- "Đóng bán trước" của Lotto 5/35 tính bằng **phút**, khác Keno và Bingo 18 tính bằng giây. Giá trị
  cụ thể tra `getGameConfig` section `play`.
- Vé đã thanh toán (paid) **không sửa được** board/số kỳ chơi — mọi thay đổi sau đó xử lý ở cấp
  entry (hủy kỳ, kết sổ lại), không sửa vé gốc.
