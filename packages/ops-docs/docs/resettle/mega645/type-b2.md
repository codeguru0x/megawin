# Kết sổ lại — Type B2 (Nhiều kỳ liên tiếp)

## Khi nào áp dụng

Dùng khi sửa kết quả một kỳ mà **phía sau nó đã có các kỳ khác kết sổ**. Vì tiền tích luỹ Jackpot truyền từ kỳ này sang kỳ kế tiếp, sửa một kỳ sẽ kéo theo **tất cả các kỳ sau phải kết sổ lại tuần tự**.

Hệ thống sẽ cho biết danh sách các kỳ cần xử lý và **đúng thứ tự** phải làm.

## Ai làm

- **Nhân viên vận hành (Staff)**: kết sổ lại từng kỳ theo thứ tự.
- **Quản trị viên (DBA)**: sao lưu trước khi bắt đầu, và cập nhật chu kỳ Jackpot sau **mỗi** kỳ.

## Trước khi bắt đầu

1. Báo **Quản trị viên (DBA)** sao lưu dữ liệu trước khi bắt đầu.
2. Lấy **danh sách các kỳ cần xử lý theo thứ tự** từ bước kiểm tra của hệ thống. **Quản trị viên chỉ định rõ phải kết sổ lại HẾT các kỳ sau kỳ đầu tiên** — nhân viên vận hành làm tuần tự cho đến kỳ cuối cùng trong danh sách, không bỏ sót kỳ nào.
3. **Không mở bán / không kết sổ kỳ mới** trong lúc đang xử lý chuỗi kỳ này.

## Các bước thực hiện (lặp cho từng kỳ, đúng thứ tự)

1. Kết sổ lại kỳ hiện tại trên màn hình **Vận hành**:
   - Kỳ **đầu tiên**: bấm **Sửa kết quả**, nhập kết quả mới rồi công bố. Sau đó nút **Kết sổ lại** (màu cam) xuất hiện — bấm để chạy.
   - Các kỳ **sau**: số quay **không đổi** nên không cần (và không được) sửa kết quả. Hệ thống không tự mở luồng kết sổ lại — mở **menu ⋮ (góc phải trên, cạnh tiêu đề kỳ)** rồi chọn **"Mở để kết sổ lại"** để đưa kỳ vào luồng. Sau đó nút **"Kết sổ lại"** (màu cam) xuất hiện ở thanh thao tác — bấm để chạy (tiền Jackpot có thể đổi dù số quay giữ nguyên).
2. Đợi hệ thống báo kỳ này **Đã kết sổ**.
3. **Báo Quản trị viên** cập nhật chu kỳ Jackpot cho kỳ vừa xong.
4. **ĐỢI Quản trị viên xác nhận xong** rồi mới chuyển sang kỳ kế tiếp.

Lặp lại cho đến hết danh sách.

> Lưu ý về mục **"Mở để kết sổ lại"**: nằm trong **menu ⋮ ở góc phải trên** của khung kỳ, chỉ xuất hiện ở các kỳ **Đã kết sổ** có số quay không đổi. Mục này chỉ **mở cổng** kết sổ lại — KHÔNG tự kiểm tra kỳ có thuộc chuỗi hay không. Vì vậy **chỉ chọn khi Quản trị viên đã chỉ định kỳ này nằm trong danh sách cascade**. Sau khi mở, vẫn phải bấm **"Kết sổ lại"** để chạy.

## Dấu hiệu hoàn tất

- Tất cả các kỳ trong danh sách đều **Đã kết sổ**.
- Quản trị viên xác nhận chu kỳ Jackpot cuối cùng đúng.
- Mở bán kỳ mới trở lại.

> Cảnh báo: **KHÔNG** kết sổ lại kỳ tiếp theo khi kỳ hiện tại chưa được Quản trị viên xác nhận xong. Làm sai thứ tự sẽ khiến tiền Jackpot tính sai cho các kỳ sau. Hệ thống sẽ chặn nếu bạn cố làm vượt thứ tự.
