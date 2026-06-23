# Kết sổ lại — Type B1 (Đổi người trúng Jackpot)

## Khi nào áp dụng

Dùng khi sửa kết quả một kỳ làm **thay đổi người trúng Jackpot** — có thể là:

- Xuất hiện người trúng Jackpot mới (trước đó không có).
- Gỡ bỏ người trúng Jackpot cũ (kết quả mới không còn ai trúng).
- Vẫn có người trúng nhưng số người hoặc số tiền thay đổi.

Và kỳ này là **kỳ mới nhất đã kết sổ** — phía sau nó chưa có kỳ nào khác đã kết sổ.

> Nếu phía sau kỳ này còn các kỳ **đã kết sổ**, đây là **Type B2** — làm theo hướng dẫn Type B2.

## Ai làm

- **Nhân viên vận hành (Staff)**: thực hiện kết sổ lại trên màn hình.
- **Quản trị viên (DBA)**: cập nhật lại chu kỳ Jackpot sau khi hệ thống chạy xong.

## Các bước thực hiện

1. **Báo trước cho Quản trị viên (DBA)**: sắp có kết sổ lại loại Type B1 để DBA chuẩn bị.
2. Mở màn **Vận hành** của Mega 6/45, chọn kỳ cần sửa (đang ở trạng thái **Đã kết sổ**), bấm **Sửa kết quả** và nhập kết quả mới, rồi công bố. Kỳ chuyển sang **Đã công bố**.
3. Nút **Kết sổ lại** (màu cam) xuất hiện. Bấm **Kết sổ lại** — hệ thống hiển thị kết quả vừa sửa để rà soát và xác nhận đây là **Type B1**. Bấm tiếp tục.
4. Đợi hệ thống chạy xong, trạng thái kỳ chuyển về **Đã kết sổ**.
5. **Báo Quản trị viên** rằng kỳ đã kết sổ xong để DBA cập nhật chu kỳ Jackpot.
6. Đợi Quản trị viên **xác nhận đã cập nhật xong**.

## Dấu hiệu hoàn tất

- Trạng thái kỳ hiển thị **Đã kết sổ**.
- Quản trị viên xác nhận chu kỳ Jackpot (số tiền tích luỹ Jackpot) đã đúng.

> Cảnh báo: Việc kết sổ lại **chưa hoàn tất** cho đến khi Quản trị viên xác nhận cập nhật chu kỳ Jackpot xong. Không bỏ qua bước báo DBA.
