# Lotto 5/35 — Nội dung đặt cược

> **Số liệu trong tài liệu này:** mệnh giá và giới hạn cược PHẢI lấy bằng `getGameConfig` cho
> Lotto 5/35 trong chính lượt trả lời. Công thức tính số line/giá tiền dưới đây là quy tắc cố
> định của game, nhưng đơn giá và giới hạn số lượng phải tra config.

## Cấu trúc 1 vé

1 vé chứa nhiều **board** (số board tối đa tra `getGameConfig` section `play` — KHÔNG giả định con
số nào). Mỗi board chọn 1 trong 4 cách chơi dưới đây, độc lập với các board khác. Vé có thể mua cho
nhiều kỳ liên tiếp cùng lúc (số kỳ tối đa cũng tra section `play`) — mỗi board áp dụng cho toàn bộ
các kỳ đã chọn.

Mỗi board sinh ra 1 hoặc nhiều **line** — 1 line là 1 tổ hợp cụ thể (5 số chính + 1 số đặc biệt)
được so khớp với kết quả quay. Board chơi cơ bản luôn có đúng 1 line; board chơi bao sinh nhiều
line theo công thức tổ hợp.

## 4 cách chơi (play type)

### Chơi cơ bản (Standard)

Chọn đúng 5 số chính + 1 số đặc biệt. Sinh ra **1 line** duy nhất.

### Bao 4 số chính (MainCover4)

Chọn 4 số chính + 1 số đặc biệt. Hệ thống tự ghép thêm từng số còn lại trong tập 35 số (không
trùng 4 số đã chọn) để tạo ra các bộ 5 số chính khác nhau — mỗi bộ kết hợp với cùng 1 số đặc
biệt tạo thành 1 line. Số line sinh ra cố định = 31 (bằng 35 trừ 4 số đã chọn).

### Bao số chính (MainCover, chọn N số chính, N từ 6 đến 15)

Chọn N số chính (6 ≤ N ≤ 15) + 1 số đặc biệt. Hệ thống sinh tất cả tổ hợp chập 5 từ N số đã
chọn, mỗi tổ hợp kết hợp với số đặc biệt đã chọn thành 1 line.

```
Số line = C(N, 5)  — tổ hợp chọn 5 từ N số chính đã chọn
```

### Bao số đặc biệt (SpecialCover)

Chọn đúng 5 số chính + K số đặc biệt (2 ≤ K ≤ 12). Mỗi số đặc biệt đã chọn kết hợp với 5 số
chính tạo thành 1 line riêng.

```
Số line = K  — bằng đúng số lượng số đặc biệt đã chọn
```

## Tính tiền cược

```
betUnitCount (1 board) = số line của board × betCount (số lần tham gia dự thưởng, người chơi chọn)
amount (1 board, 1 kỳ) = betUnitCount × đơn giá 1 line (tra `getGameConfig` section `play`)
amount (1 kỳ, cả vé)   = Σ amount(board) trên tất cả board đang active kỳ đó
totalAmount (cả vé)    = amount (1 kỳ) × số kỳ liên tiếp đã chọn
```

`betCount` nằm trong khoảng sàn/trần cấu hình (tra `getGameConfig` section `play`), mặc định 1
nếu không chỉ định. `betCount` nhân vào **mỗi line** của board — khác với số line (do cách chơi
bao sinh ra), `betCount` là hệ số nhân bội thêm do người chơi chủ động chọn.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Giá 1 line cho 1 kỳ | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ | `getGameConfig` section `play` |
| Số board tối đa 1 vé, số kỳ liên tiếp tối đa | `getGameConfig` section `play` |

## Câu hỏi thường gặp của nhân viên

- "Bao 8 số chính giá bao nhiêu 1 kỳ?" → Tính `C(8,5) = 56` line, nhân với đơn giá 1 line lấy từ
  `getGameConfig` (KHÔNG dùng số giá đã nhớ từ trước — đơn giá có thể đã thay đổi).
- "Bao đặc biệt chọn 5 số đặc biệt sinh mấy line?" → Đúng 5 line (bằng số đặc biệt đã chọn).

## Lưu ý dễ sai

- Bao số chính và Bao đặc biệt sinh số line theo 2 công thức **khác nhau hoàn toàn** — Bao số
  chính dùng tổ hợp C(N,5), Bao đặc biệt chỉ bằng đúng K (số đặc biệt đã chọn), không phải tổ
  hợp.
- `betCount` **không phải** số line — đừng nhầm "chơi bao nhiều tổ hợp" với "nhân bội betCount".
  Cả hai đều nhân vào tiền cược nhưng là 2 đại lượng độc lập.
- Số line chỉ **được tính**, không phải giá trị nhập tay hay lưu cấu hình — không có ở
  `getGameConfig`.
