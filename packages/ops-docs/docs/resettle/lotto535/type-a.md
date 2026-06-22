# Kết sổ lại — Type A (Sửa kỳ độc lập)

## Khi nào áp dụng

Dùng khi cần sửa kết quả một kỳ quay đã công bố mà **kết quả mới lẫn cũ đều KHÔNG có ai trúng Jackpot**, và **phía sau kỳ đó chưa có kỳ nào khác đã kết sổ**. Đây là trường hợp đơn giản nhất: việc sửa chỉ ảnh hưởng đúng kỳ đó.

> Nếu kết quả cũ hoặc mới có người trúng Jackpot, hoặc phía sau đã có kỳ khác kết sổ, đây **không phải** Type A. Hệ thống sẽ báo Type B1 hoặc Type B2 ở bước kiểm tra — làm theo hướng dẫn tương ứng.

## Ai làm

Chỉ cần **Nhân viên vận hành (Staff)**. Không cần Quản trị viên (DBA) can thiệp.

## Các bước thực hiện

1. Mở màn **Vận hành (Operations)** của Lotto 5/35, tìm đúng kỳ cần sửa.
2. Bấm **Kết sổ lại** và nhập kết quả mới (dãy số trúng).
3. Hệ thống tự kiểm tra và xác nhận đây là trường hợp **Type A** — bấm tiếp tục.
4. Đợi hệ thống chạy xong. Trạng thái kỳ sẽ chuyển về **Đã kết sổ (settled)**.

## Dấu hiệu hoàn tất

- Trạng thái kỳ hiển thị **Đã kết sổ**.
- Tiền thắng của người chơi được tính lại theo kết quả mới (hoàn tiền cũ, trả tiền mới tự động).

> Nếu sau khoảng 15 phút kỳ vẫn kẹt ở trạng thái **đang kết sổ (settling)**, báo đội kỹ thuật kiểm tra. Không bấm lại nhiều lần.
