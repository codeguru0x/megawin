# Tài liệu sản phẩm Xổ Số Truyền Thống (Lottery)

Bộ tài liệu này mô tả **đầy đủ và chi tiết** kiến trúc, nghiệp vụ, entity, công thức tính toán, luồng xử lý của sản phẩm **Xổ số truyền thống Việt Nam** hiện có trong dự án (`server/src/services/lottery`).

Mục đích: làm **tài nguyên tham khảo** để xây dựng một sản phẩm xổ số truyền thống tương tự (hoặc nâng cấp) cho **Megawin**.

> Toàn bộ tài liệu được tổng hợp từ source code thực tế. Các trích dẫn `path:line` trỏ tới file gốc để đối chiếu. Không chứa thông tin nhạy cảm (secret/credential); các biến môi trường chỉ được ghi nhận **tên biến**, không có giá trị.

---

## Cách đọc bộ tài liệu

1. Đọc [`00-tong-quan.md`](./00-tong-quan.md) trước để nắm bức tranh tổng thể: kiến trúc serverless, domain model, danh sách đài & kiểu cược, danh sách microservice, luồng nghiệp vụ end-to-end, và bản đồ dữ liệu (MongoDB/Redis/DynamoDB).
2. Sau đó đọc từng file chi tiết theo chức năng con (xem index bên dưới).
3. Khi lập plan xây sản phẩm mới, dùng phần "Gợi ý khi xây lại" ở cuối mỗi file.

---

## Index các file chi tiết

| #   | File                                                             | Chức năng                                                                                  | Độ ưu tiên khi xây lại     |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------- |
| 00  | [`00-tong-quan.md`](./00-tong-quan.md)                           | Tổng quan kiến trúc, domain, danh sách service, luồng tổng                                 | ⭐ Đọc đầu tiên            |
| 01  | [`01-term-lich-quay.md`](./01-term-lich-quay.md)                 | Kỳ mở thưởng (term), lịch quay đài (city-schedule), tham số (parameter)                    | Cao                        |
| 02  | [`02-user-game-setting.md`](./02-user-game-setting.md)           | Cấu hình giới hạn cược theo user, game-limit                                               | Cao                        |
| 03  | [`03-share-holder-chia-thau.md`](./03-share-holder-chia-thau.md) | Đồng sở hữu / chia thầu %, giá mua vào, number-share                                       | ⭐ Rất cao (lõi tài chính) |
| 04  | [`04-extra-price-gia-cuoc.md`](./04-extra-price-gia-cuoc.md)     | Giá tăng cường (tay/tự động/quan hệ), bảng thao tác giá, risk                              | ⭐ Rất cao                 |
| 05  | [`05-lo-live.md`](./05-lo-live.md)                               | Lô Live: giá cơ bản theo giải, make-odds, đóng giải                                        | Cao (tính năng nâng cao)   |
| 06  | [`06-stop-number-dung-so.md`](./06-stop-number-dung-so.md)       | Dừng số / mở lại số                                                                        | Trung bình                 |
| 07  | [`07-game-play-dat-cuoc.md`](./07-game-play-dat-cuoc.md)         | Đặt cược (place-betting), ticket/ticket-item, state machine                                | ⭐ Rất cao (lõi giao dịch) |
| 08  | [`08-huy-phieu-huy-so.md`](./08-huy-phieu-huy-so.md)             | Huỷ phiếu (player/manager), huỷ số (number-cancel)                                         | Cao                        |
| 09  | [`09-single-multi-number.md`](./09-single-multi-number.md)       | Thống kê điểm/tiền theo con số                                                             | Cao                        |
| 10  | [`10-lottery-result-ket-qua.md`](./10-lottery-result-ket-qua.md) | Kết quả xổ số (cấu trúc giải MB/MN), nhập kết quả                                          | Cao                        |
| 11  | [`11-bookkeeping-ket-so.md`](./11-bookkeeping-ket-so.md)         | Kết sổ, dò trúng, tính thắng thua, redo, kết sổ thử                                        | ⭐ Rất cao (lõi nghiệp vụ) |
| 12  | [`12-finance-tra-thuong.md`](./12-finance-tra-thuong.md)         | Tài chính, trả thưởng / thu tiền player                                                    | Cao                        |
| 13  | [`13-report-analytics-risk.md`](./13-report-analytics-risk.md)   | Báo cáo (statement/outstanding/winlose/canceled...), analytics, risk-management, data-lake | Cao                        |

---

## Quy ước ký hiệu

- **Đài / GameType**: một "đài" xổ số (Miền Bắc 1, Miền Nam 18A...).
- **Kiểu cược / BetType**: cách chơi (Đề, Lô, Xiên, Trượt...).
- **Term (kỳ)**: một phiên mở thưởng, mỗi ngày 1 phiên, định danh `YYYY-MM-DD`.
- **Điểm (Point)**: đơn vị cược. Tiền cược = Điểm × giá × hệ số.
- **Thầu (share)**: phần rủi ro mà mỗi cấp đại lý "ôm". Tổng % thầu các cấp = 100%.
- **Nháy (Frequence / MultiPay)**: số lần một con số về trong bảng kết quả (Lô ăn nhiều nháy).
- **Cấp tài khoản**: Owner(0) → Company(1) → Manager(2) → Super(3) → Master(4) → Agent(5) → Player(9).
