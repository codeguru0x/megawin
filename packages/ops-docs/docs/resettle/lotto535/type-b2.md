# Kết sổ lại — Type B2 (Nhiều kỳ liên tiếp)

## Khi nào áp dụng

Dùng khi sửa kết quả một kỳ mà **phía sau nó đã có các kỳ khác kết sổ**. Với Lotto 5/35, tiền tích luỹ Jackpot và việc chia giải (split) đều phụ thuộc vào kỳ trước, nên sửa một kỳ sẽ kéo theo **tất cả các kỳ sau phải kết sổ lại tuần tự** — kể cả khi số quay của các kỳ sau không đổi.

Hệ thống sẽ cho biết danh sách các kỳ cần xử lý và **đúng thứ tự** phải làm.

## Ai làm

- **Nhân viên vận hành (Staff)**: kết sổ lại từng kỳ theo thứ tự.
- **Quản trị viên (DBA)**: sao lưu trước khi bắt đầu, và cập nhật chu kỳ Jackpot sau **mỗi** kỳ.

## Trước khi bắt đầu

1. Báo **Quản trị viên (DBA)** sao lưu dữ liệu trước khi bắt đầu.
2. Lấy **danh sách các kỳ cần xử lý theo thứ tự** từ bước kiểm tra của hệ thống. **Quản trị viên chỉ định rõ phải kết sổ lại HẾT các kỳ sau kỳ đầu tiên** — staff làm tuần tự cho đến kỳ cuối cùng trong danh sách, không bỏ sót kỳ nào.
3. **Không mở bán / không kết sổ kỳ mới** trong lúc đang xử lý chuỗi kỳ này.

## Các bước thực hiện (lặp cho từng kỳ, đúng thứ tự)

1. Kết sổ lại kỳ hiện tại trên màn hình **Vận hành**:
   - Kỳ **đầu tiên**: nhập kết quả mới.
   - Các kỳ **sau**: số quay **không đổi** nên hệ thống không tự mở luồng kết sổ lại. Bấm nút **"Mở để kết sổ lại"** (màu cam) để đưa kỳ vào luồng, rồi bấm **"Kết sổ lại"** như bình thường (tiền Jackpot và việc chia giải có thể đổi dù số quay giữ nguyên).
2. Đợi hệ thống báo kỳ này **Đã kết sổ**.
3. **Báo Quản trị viên** cập nhật chu kỳ Jackpot cho kỳ vừa xong.
4. **ĐỢI Quản trị viên xác nhận xong** rồi mới chuyển sang kỳ kế tiếp.

Lặp lại cho đến hết danh sách.

> Lưu ý về nút **"Mở để kết sổ lại"**: chỉ xuất hiện ở các kỳ **Đã kết sổ** có số quay không đổi. Nút này chỉ **mở cổng** kết sổ lại — KHÔNG tự kiểm tra kỳ có thuộc chuỗi hay không. Vì vậy **chỉ bấm khi Quản trị viên đã chỉ định kỳ này nằm trong danh sách cascade**. Sau khi mở, vẫn phải bấm **"Kết sổ lại"** để chạy.

## Dấu hiệu hoàn tất

- Tất cả các kỳ trong danh sách đều **Đã kết sổ**.
- Quản trị viên xác nhận chu kỳ Jackpot cuối cùng đúng.
- Mở bán kỳ mới trở lại.

> Cảnh báo: **KHÔNG** kết sổ lại kỳ tiếp theo khi kỳ hiện tại chưa được Quản trị viên xác nhận xong. Làm sai thứ tự sẽ khiến tiền Jackpot và việc chia giải tính sai cho các kỳ sau. Hệ thống sẽ chặn nếu bạn cố làm vượt thứ tự.
