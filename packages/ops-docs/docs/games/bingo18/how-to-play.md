# Bingo 18 — Nội dung đặt cược

> **Số liệu trong tài liệu này:** mệnh giá và giới hạn cược PHẢI lấy bằng `getGameConfig` cho
> Bingo 18 trong chính lượt trả lời. 5 cách chơi và cơ chế tính tiền dưới đây là quy tắc cố định
> của game.

## Kết quả quay là gì

Mỗi kỳ quay ra **3 số** từ tập {1, 2, 3, 4, 5, 6} — ví như 3 viên xúc xắc độc lập, **các số có
thể trùng nhau** (VD kết quả có thể là 2, 5, 2). Từ 3 số này hệ thống tính thêm **tổng** (sum,
dao động 3-18) dùng cho 2 cách chơi bổ sung.

## Cấu trúc vé — Unified Boards

Bingo 18 dùng kiến trúc **thống nhất**: tất cả 5 cách chơi (không phân biệt "cơ bản"/"bổ sung"
như tách riêng mảng ở Keno) nằm chung trong 1 danh sách `boards[]` của vé, phân biệt nhau qua
loại cách chơi (`playType`) ghi trên từng board. Mỗi board có mã tự sinh liên tục
(A, B, C... Z, AA...).

Người chơi có thể kết hợp tuỳ ý nhiều board với nhiều cách chơi khác nhau trong cùng 1 vé — không
giới hạn "panel A chỉ chơi 1 loại". Số board tối đa trên 1 vé tra `getGameConfig`.

## 5 cách chơi

### 1. Một số (`singleNum`)

Chọn 1 số từ 1-6. Hệ thống đếm số lần số đã chọn xuất hiện trong 3 số quay (0, 1, 2, hoặc 3
lần) — có 3 mức trúng thưởng khác nhau tương ứng với 1, 2, hoặc 3 lần xuất hiện.

### 2. Hai số trùng nhau (`doubleMatch`)

Chọn 1 số từ 1-6. Thắng khi kết quả quay có **ít nhất 2 trong 3 số** trùng với số đã chọn (dù 2
hay cả 3 lần, mức thưởng như nhau — xem `payout.md`).

### 3. Ba số trùng nhau (`tripleMatch`)

Có 2 biến thể, chọn khi đặt cược:

- **Cụ thể** (`specific`): chọn 1 số từ 1-6, thắng khi cả 3 số quay đều là số đã chọn.
- **Bất kỳ** (`any`): không cần chọn số, thắng khi cả 3 số quay giống nhau (bất kể số nào trong
  1-6).

### 4. Cộng tổng (`sumTotal`)

Chọn 1 giá trị tổng cụ thể từ 3 đến 18. Thắng khi tổng 3 số quay đúng bằng giá trị đã chọn.
Bảng giải **đối xứng quanh 10-11** — tổng biên (3 hoặc 18) hiếm gặp nhất nên có hệ số nhân giải
cao nhất; tổng giữa (10, 11) phổ biến nhất nên hệ số nhân thấp nhất. Xem chi tiết từng mức ở
`payout.md`.

### 5. Lớn / Hòa / Nhỏ (`bigSmallDraw`)

Đặt cược theo phạm vi tổng 3 số quay, 3 lựa chọn:

- **Nhỏ** (`small`): tổng thuộc phạm vi thấp.
- **Hòa** (`draw`): tổng ở khoảng giữa.
- **Lớn** (`big`): tổng thuộc phạm vi cao.

Ranh giới chính xác của mỗi phạm vi là quy tắc cố định của game (không cấu hình), nhưng số tiền
giải mỗi lựa chọn PHẢI tra `getGameConfig`.

## Tính tiền cược

```
số lượt chọn mỗi kỳ = số board trong vé
tổng betCount mỗi kỳ = Σ(betCount của từng board)
tiền mỗi kỳ          = tổng betCount mỗi kỳ × mệnh giá
tổng tiền vé          = tiền mỗi kỳ × số kỳ đã chọn
```

`betCount` mỗi board hoạt động như số lần lặp cược, tương tự các game khác — tăng tuyến tính
tiền cược và tiền thắng của board đó. Mệnh giá và khoảng `betCount` hợp lệ tra `getGameConfig`
section `play`.

## Chọn nhiều kỳ liên tiếp

Vé Bingo 18 có thể chọn nhiều kỳ liên tiếp cùng lúc (số kỳ tối đa tra `getGameConfig` section
`play` — Bingo 18 cho phép nhiều kỳ liên tiếp hơn hẳn các game khác vì tần suất quay rất
cao). Đóng bán trước giờ quay tính bằng **giây** (không phải phút như game jackpot) — tra
`getGameConfig` section `play`.
