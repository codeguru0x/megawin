# Keno — Nội dung đặt cược

> **Số liệu trong tài liệu này:** mệnh giá và giới hạn cược PHẢI lấy bằng `getGameConfig` cho
> Keno trong chính lượt trả lời. Các ngưỡng phân loại kết quả (VD: "từ 13 số trở lên") là quy
> tắc cố định của game, không phải số cấu hình — nhưng **tiền giải** ứng với mỗi ngưỡng vẫn phải
> tra config.

## Cấu trúc 1 vé — unified boards

1 vé Keno chứa danh sách **board** — số board cơ bản tối đa trên 1 vé là **cấu hình**, tra
`getGameConfig` section `play`, KHÔNG giả định con số nào. Mỗi board độc lập chọn 1 trong các cách
chơi dưới đây — không có khái niệm "board cơ bản" tách khỏi "board side bet", tất cả nằm chung 1
danh sách.

Vé có thể mua cho nhiều kỳ liên tiếp cùng lúc (số kỳ tối đa tra `getGameConfig` section `play`);
mỗi board áp dụng đồng thời cho toàn bộ các kỳ đã chọn.

## Cách chơi cơ bản — chọn số

Người chơi chọn từ **1 đến 10 số** trong tập 01-80 cho 1 board (gọi là pick1 … pick10). Hệ
thống so khớp số đã chọn với 20 số kết quả quay để tính `matchCount` (số lượng số trùng).
<!-- structural: dải pick 1-10, tập 01-80 và 20 số quay là cơ chế Keno, bảng giải dựng theo pick1..pick10 -->

## Cách chơi bổ sung — side bet

Hai loại side bet, tính dựa trên đặc điểm của 20 số kết quả quay (không liên quan số người chơi
chọn):

- **Lớn/Nhỏ**: đếm trong 20 số quay có bao nhiêu số thuộc nửa "Lớn" (41-80) và bao nhiêu số
  thuộc nửa "Nhỏ" (01-40). Người chơi đặt cược Lớn hoặc Nhỏ; hệ thống tự xác định thêm trường hợp
  hoà (10-10) không thuộc cược nào của người chơi thắng theo đúng lựa chọn Lớn/Nhỏ.
- **Chẵn/Lẻ**: đếm trong 20 số quay có bao nhiêu số chẵn và bao nhiêu số lẻ. Người chơi đặt cược
  Chẵn hoặc Lẻ.

Mỗi side bet chỉ trả **1 hạng giải duy nhất** tương ứng với mức chênh lệch đạt được (VD: cược
Lớn trúng ở mức chênh cao thì nhận giải cao hơn mức chênh thấp — chi tiết mức chênh → giải xem
`payout.md`).

## Tính tiền cược

```
betUnitCount (1 board)  = betCount (số lần tham gia dự thưởng nhân bội, người chơi chọn)
amount (1 board)        = betUnitCount × đơn giá 1 lần tham gia (tra `getGameConfig` section `play`)
amount (1 kỳ, cả vé)    = Σ amount(board) trên tất cả board
totalAmount (cả vé)     = amount (1 kỳ) × số kỳ liên tiếp đã chọn
```

`betCount` nằm trong khoảng sàn/trần cấu hình (tra `getGameConfig` section `play`), mặc định 1
nếu người chơi không chỉ định. `betCount` KHÔNG liên quan số lượng số đã chọn (pick1 và pick10
dùng cùng công thức nhân `betCount`, không phải nhân theo số tổ hợp — Keno không có khái niệm
"line" như game chơi bao).

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Mệnh giá 1 lần tham gia dự thưởng | `getGameConfig` section `play` |
| Khoảng `betCount` hợp lệ (sàn/trần) | `getGameConfig` section `play` |
| Số board tối đa 1 vé | `getGameConfig` section `play` |
| Số kỳ liên tiếp tối đa | `getGameConfig` section `play` |

## Câu hỏi thường gặp của nhân viên

- "1 board Keno tối đa cược bao nhiêu tiền?" → Trần `betCount` × đơn giá 1 lần tham gia, cả hai
  lấy từ `getGameConfig` section `play`.
- "Keno có chơi bao (chọn nhiều tổ hợp) không?" → Không. Mỗi board là 1 lựa chọn cố định, không
  sinh nhiều "line" như Lotto 5/35/Mega 6/45/Power 6/55.

## Lưu ý dễ sai

- `betCount` là **số lần nhân bội**, không phải "số tổ hợp" — Keno không có bước sinh nhiều
  line từ 1 board như các game chơi bao.
- Ngưỡng phân loại Lớn/Nhỏ (biên 40/41) và các mốc đếm (≥13, 11-12, 10-10…) là quy tắc **cố
  định** của game — chỉ **tiền giải** ứng với từng mốc mới cần tra cấu hình.
