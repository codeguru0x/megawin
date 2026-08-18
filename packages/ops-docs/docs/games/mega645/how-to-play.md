# Mega 6/45 — Nội dung đặt cược

> **Số liệu trong tài liệu này:** đơn giá và giới hạn cược PHẢI lấy bằng `getGameConfig` cho
> Mega 6/45 trong chính lượt trả lời. Công thức tính số line/giá tiền dưới đây là quy tắc cố
> định của game, nhưng đơn giá và giới hạn số lượng phải tra config.

## Cấu trúc 1 vé

1 vé chứa nhiều **board** (số board tối đa tra `getGameConfig` section `play` — KHÔNG giả định con
số nào). Mỗi board chọn 1 trong 3 cách chơi dưới đây, độc lập với các board khác. Vé có thể mua cho
nhiều kỳ liên tiếp cùng lúc (số kỳ tối đa cũng tra section `play`) — mỗi board áp dụng cho toàn bộ
các kỳ đã chọn.

Mỗi board sinh ra 1 hoặc nhiều **line** — 1 line là 1 tổ hợp cụ thể (6 số) được so khớp với kết
quả quay. Board chơi cơ bản luôn có đúng 1 line; board chơi bao sinh nhiều line theo công thức
tổ hợp.

## 3 cách chơi (play type)

### Chơi cơ bản (Standard)

Chọn đúng 6 số. Sinh ra **1 line** duy nhất.

### Bao 5 số (đặc biệt)

Chọn 5 số. Hệ thống tự ghép thêm từng số còn lại trong tập 45 số (không trùng 5 số đã chọn) để
tạo ra các bộ 6 số khác nhau, mỗi bộ là 1 line. Số line sinh ra cố định = 40 (bằng 45 trừ 5 số đã
chọn).

### Bao số (chọn N số, N từ 7 đến 18)

Chọn N số (7 ≤ N ≤ 18). Hệ thống sinh tất cả tổ hợp chập 6 từ N số đã chọn, mỗi tổ hợp là 1 line.

```
Số line = C(N, 6)  — tổ hợp chọn 6 từ N số đã chọn
```

## Tính tiền cược

```
betUnitCount (1 board) = số line của board × betCount (số lần tham gia dự thưởng, người chơi chọn)
amount (1 board, 1 kỳ) = betUnitCount × đơn giá 1 line (tra `getGameConfig` section `play`)
amount (1 kỳ, cả vé)   = Σ amount(board) trên tất cả board đang active kỳ đó
totalAmount (cả vé)    = amount (1 kỳ) × số kỳ liên tiếp đã chọn
```

`betCount` nằm trong khoảng sàn/trần cấu hình (tra `getGameConfig` section `play`), mặc định 1 nếu không chỉ
định. `betCount` nhân vào **mỗi line** của board.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Đơn giá 1 line | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ | `getGameConfig` section `play` |
| Số board tối đa 1 vé, số kỳ liên tiếp tối đa | `getGameConfig` section `play` |

## Câu hỏi thường gặp của nhân viên

- "Bao 10 số giá bao nhiêu 1 kỳ?" → Tính `C(10,6) = 210` line, nhân với đơn giá 1 line lấy từ
  `getGameConfig`.
- "Bao 5 số sinh mấy line?" → Đúng 40 line (bằng 45 - 5 số còn lại trong tập, không phải tổ hợp
  chập 6 như các mức Bao khác).

## Lưu ý dễ sai

- Bao 5 là **ngoại lệ** — chỉ ghép thêm từng số còn lại (40 line), không dùng công thức tổ hợp
  C(N,6) như Bao 7 trở lên. Đừng nhầm với cách tính Bao 4 của Lotto 5/35 (cũng là trường hợp
  ngoại lệ nhưng số khác — 31 line).
- Mega 6/45 **không có** số đặc biệt — mọi việc so khớp chỉ dựa trên số lượng số trùng
  (`matchCount`), không có khái niệm "trùng đặc biệt" như Lotto 5/35.
- Số line chỉ **được tính**, không phải giá trị lưu cấu hình — không có ở `getGameConfig`.
