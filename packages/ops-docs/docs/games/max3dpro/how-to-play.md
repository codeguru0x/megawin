# Max 3D Pro — Nội dung đặt cược

> **Số liệu trong tài liệu này:** mệnh giá và giới hạn cược PHẢI lấy bằng `getGameConfig` cho
> Max 3D Pro trong chính lượt trả lời. Cơ chế sinh cặp dưới đây là quy tắc cố định của game.

## Cấu trúc 1 vé

1 vé chứa nhiều **board** (số board tối đa tra `getGameConfig` section `play` — KHÔNG giả định con
số nào). Mỗi board chọn 1 trong 2 cách chơi dưới đây, độc lập với các board khác. Đơn vị cơ bản của
Max 3D Pro là **cặp có thứ tự** (bộ "đầu" và bộ "sau") — đổi vị trí 2 bộ trong 1 cặp tạo ra 1 cặp
khác, vì thứ tự quyết định trúng Giải Đặc Biệt hay Giải Phụ Đặc Biệt (xem `payout.md`).

## 2 cách chơi (play mode)

### Bao nhiều bộ số (MultiNumber)

Chọn từ 3 đến 20 bộ ba số khác nhau. Hệ thống tự sinh **tất cả cặp có thứ tự** giữa các bộ đã
chọn (mỗi 2 bộ tạo ra 2 cặp — theo cả 2 hướng thứ tự).

```
Số cặp = n × (n - 1)   — với n là số bộ ba số đã chọn (3 ≤ n ≤ 20)
```

VD: chọn 3 bộ ba → sinh 3 × 2 = 6 cặp có thứ tự.

### Bao bộ ba số (MultiDigit)

Chọn **3 chữ số cho bộ đầu** và **3 chữ số cho bộ sau** riêng biệt. Hệ thống sinh tất cả hoán vị
hợp lệ của mỗi bên, rồi ghép **mọi tổ hợp giữa 1 hoán vị bộ đầu với 1 hoán vị bộ sau** thành 1
cặp.

```
Số cặp = (số hoán vị của bộ đầu) × (số hoán vị của bộ sau)
```

Số hoán vị của 1 bộ 3 chữ số phụ thuộc cấu trúc: 3 chữ số khác nhau hoàn toàn → 6 hoán vị; đúng 2
chữ số giống nhau → 3 hoán vị; cả 3 chữ số giống nhau → 1 hoán vị.

## Tính tiền cược

```
betUnitCount (1 board) = số cặp của board × betCount (số lần tham gia dự thưởng, người chơi chọn)
amount (1 board, 1 kỳ) = betUnitCount × đơn giá 1 line (tra `getGameConfig` section `play`)
amount (1 kỳ, cả vé)   = Σ amount(board) trên tất cả board đang active kỳ đó
totalAmount (cả vé)    = amount (1 kỳ) × số kỳ liên tiếp đã chọn
```

`betCount` nằm trong khoảng sàn/trần cấu hình (tra `getGameConfig` section `play`), mặc định 1 nếu không chỉ
định.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Mệnh giá 1 lần tham gia dự thưởng | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ | `getGameConfig` section `play` |
| Số board tối đa 1 vé, số kỳ liên tiếp tối đa | `getGameConfig` section `play` |

## Câu hỏi thường gặp của nhân viên

- "Chọn 5 bộ ba số ở MultiNumber sinh mấy cặp?" → `5 × 4 = 20` cặp.
- "MultiDigit chọn bộ đầu 3 số khác nhau, bộ sau 2 số giống nhau, sinh mấy cặp?" → `6 × 3 = 18`
  cặp.

## Lưu ý dễ sai

- MultiNumber dùng công thức **hoán vị chập 2 có thứ tự** (`n × (n-1)`), khác hoàn toàn công thức
  tổ hợp `C(N,k)` của Lotto 5/35/Mega 6/45/Power 6/55 — đây là điểm dễ tính nhầm nhất.
- MultiDigit tính riêng số hoán vị của **từng bên** (đầu và sau) rồi nhân lại — không cộng, không
  dùng chung 1 công thức cho cả cặp.
- Max 3D Pro **không có** chế độ "chọn 1 bộ ba số duy nhất" như Max 3D Cơ Bản — mọi lựa chọn đều
  sinh ra ít nhất vài cặp.
