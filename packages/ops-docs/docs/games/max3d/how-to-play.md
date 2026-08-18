# Max 3D — Nội dung đặt cược

> **Số liệu trong tài liệu này:** mệnh giá và giới hạn cược PHẢI lấy bằng `getGameConfig` cho
> Max 3D trong chính lượt trả lời. Cơ chế sinh line/hoán vị dưới đây là quy tắc cố định của game.

## Cấu trúc 1 vé

1 vé chứa nhiều **board** (số board tối đa tra `getGameConfig` section `play` — KHÔNG giả định con
số nào). Mỗi board chọn 1 trong 2 chế độ chơi (basic hoặc plus), độc lập với các board khác. Vé có
thể mua cho nhiều kỳ liên tiếp cùng lúc (số kỳ tối đa cũng tra section `play`).

## Chế độ Cơ Bản (`basic`) — chọn 1 bộ ba số

Chọn 1 bộ ba số (3 chữ số, "000"-"999"). Có 3 cách chơi trong chế độ này:

### Khớp đúng thứ tự (Straight)

Chọn nguyên 1 bộ ba cố định. Sinh ra **1 line** duy nhất — chỉ thắng khi có 1 bộ trong 20 bộ kết
quả trùng **đúng thứ tự từng chữ số**.

### Tổ hợp 3 (Combo3)

Chọn 1 bộ ba có **đúng 2 chữ số giống nhau** (VD "112", "221"). Hệ thống tự sinh tất cả hoán vị
khác nhau của 3 chữ số đó — với 2 chữ số giống nhau, số hoán vị khác nhau là **3**. Mỗi hoán vị
là 1 line riêng, so khớp độc lập với 20 bộ kết quả (theo kiểu khớp đúng thứ tự).

### Tổ hợp 6 (Combo6)

Chọn 1 bộ ba có **3 chữ số khác nhau hoàn toàn** (VD "123", "789"). Hệ thống sinh đủ **6** hoán vị
khác nhau, mỗi hoán vị là 1 line riêng.

```
3 chữ số khác nhau hoàn toàn → 6 hoán vị (Combo6)
Đúng 2 chữ số giống nhau      → 3 hoán vị (Combo3)
Cả 3 chữ số giống nhau        → 1 hoán vị (chỉ hợp lệ cho Straight, không chọn được Combo)
```

## Chế độ Max 3D+ (`plus`) — chọn 2 bộ ba số

Chọn **2 bộ ba số** cùng lúc (2 bộ có thể giống nhau). Chế độ Plus **chỉ hỗ trợ** cách chơi khớp
đúng thứ tự — không có combo. Điều kiện trúng và cách trả thưởng của Plus phức tạp hơn nhiều so
với Cơ Bản, xem chi tiết đầy đủ ở `payout.md`.

## Tính tiền cược

```
betUnitCount (1 board) = số line của board × betCount (số lần tham gia dự thưởng, người chơi chọn)
amount (1 board, 1 kỳ) = betUnitCount × đơn giá 1 line (tra `getGameConfig` section `play`)
amount (1 kỳ, cả vé)   = Σ amount(board) trên tất cả board đang active kỳ đó
totalAmount (cả vé)    = amount (1 kỳ) × số kỳ liên tiếp đã chọn
```

Straight và Plus luôn có `số line = 1`. Combo3 có `số line = 3` (hoặc ít hơn nếu 3 chữ số giống
nhau hoàn toàn — nhưng trường hợp đó chỉ hợp lệ cho Straight, không chọn được Combo3/Combo6).
Combo6 luôn có `số line = 6`.

`betCount` nằm trong khoảng sàn/trần cấu hình (tra `getGameConfig` section `play`), mặc định 1 nếu không chỉ
định.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Mệnh giá 1 lần tham gia dự thưởng | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ | `getGameConfig` section `play` |
| Số board tối đa 1 vé, số kỳ liên tiếp tối đa | `getGameConfig` section `play` |

## Câu hỏi thường gặp của nhân viên

- "Chơi Combo6 giá gấp mấy lần Straight?" → Gấp 6 lần (vì sinh 6 line thay vì 1), đơn giá 1 line
  vẫn lấy từ `getGameConfig`.
- "Chọn '333' có chơi được Combo3 không?" → Không — 3 chữ số giống nhau hoàn toàn chỉ hợp lệ cho
  Straight, không sinh được hoán vị khác cho Combo3/Combo6.

## Lưu ý dễ sai

- Số hoán vị phụ thuộc **cấu trúc chữ số** của bộ ba đã chọn, không phải cố định theo tên cách
  chơi — hệ thống tự validate bộ ba có đúng cấu trúc phù hợp (2 số giống cho Combo3, 3 số khác
  nhau cho Combo6) trước khi cho đặt cược.
<!-- structural: "2 bộ ba = 1 board" là cơ chế chế độ Plus, không phải giới hạn cấu hình -->
- Chế độ Plus chọn **2 bộ ba** nhưng vẫn tính là **1 board**, không phải 2 board riêng — tiền
  cược của board Plus vẫn theo `số line (luôn = 1) × betCount × đơn giá 1 line`.
