# Keno — Điều kiện trúng & cách trả thưởng

> **Số liệu trong tài liệu này:** mọi số tiền giải, trần trả thưởng PHẢI lấy bằng `getGameConfig`
> cho Keno trong chính lượt trả lời (section `prizes`, cần truyền `pickSize` khi hỏi về bảng giải
> cách chơi cơ bản). Tài liệu này chỉ mô tả điều kiện trúng và cơ chế trần trả thưởng.

## Điều kiện trúng — cách chơi cơ bản

Người chơi thắng khi `matchCount` (số lượng số trùng giữa lựa chọn và 20 số kết quả) đạt một
mức trong bảng giải tương ứng với số lượng số đã chọn (pickSize 1-10). Mỗi cặp
`(pickSize, matchCount)` có 1 mức tiền giải riêng.

**Giải an ủi khi trùng 0 số**: CHỈ áp dụng cho pick8, pick9, pick10 (chọn 8, 9 hoặc 10 số mà
không trùng số nào vẫn được 1 mức giải nhỏ). Pick1-pick7 không có giải khi trùng 0 số.

Muốn biết đầy đủ bảng giải của 1 pickSize cụ thể, gọi `getGameConfig` với `pickSize` tương ứng —
bảng đầy đủ cả 10 pickSize quá dài để trả một lần.

## Điều kiện trúng — side bet

- **Lớn/Nhỏ**: mức giải phụ thuộc độ lệch giữa số lượng "Lớn" và "Nhỏ" trong 20 số quay —
  lệch nhiều (≥13 một bên) trả cao hơn lệch ít (11-12 một bên); trường hợp hoà 10-10 có mức
  giải riêng cho cả 2 phía đặt cược.
- **Chẵn/Lẻ**: tương tự, mức giải phụ thuộc độ lệch giữa số chẵn và số lẻ trong 20 số quay.

## Trần trả thưởng mỗi kỳ (Payout Caps) — chỉ bậc trùng cao nhất

Áp dụng riêng cho 3 mức: trùng đúng 8/8 (pick8), 9/9 (pick9), 10/10 (pick10) — đây là các mức có
tiền giải/bộ rất lớn nên hệ thống giới hạn tổng chi trả mỗi kỳ để tránh rủi ro tài chính:

```
nếu số bộ trúng ≤ ngưỡng "còn trả giá cố định" → mỗi bộ nhận đúng mức giải cố định
nếu số bộ trúng > ngưỡng đó → tổng trần chia đều cho tất cả bộ trúng (mỗi bộ nhận ít hơn)
```

Ngưỡng "số bộ còn được trả giá cố định" và "tổng trần mỗi kỳ" của từng bậc (8/9/10) đều là số
cấu hình riêng — tra `getGameConfig` section `prizes`.

Các bậc trùng thấp hơn (0-7 số, tuỳ pickSize) **không** có trần — luôn trả đúng giá cố định theo
bảng, không phụ thuộc số bộ trúng trong kỳ.

## Giá trị lĩnh thưởng thực tế theo betCount

Tiền thắng của 1 board = tiền giải (theo bảng, đã áp trần nếu có) × `betCount` của board đó.
`betCount` không ảnh hưởng đến việc có trúng hay không, chỉ nhân vào số tiền lĩnh.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Bảng giải cách chơi cơ bản theo pickSize | `getGameConfig` section `prizes`, truyền `pickSize` |
| Bảng giải Lớn/Nhỏ, Chẵn/Lẻ | `getGameConfig` section `prizes` |
| Ngưỡng số bộ còn trả giá cố định + tổng trần mỗi kỳ (bậc 8/9/10) | `getGameConfig` section `prizes` |
| Hoa hồng đại lý mặc định | `getGameConfig` section `rates` |

## Câu hỏi thường gặp của nhân viên

- "Trùng 8/8 mà kỳ này có 60 bộ trúng thì mỗi bộ được bao nhiêu?" → So `60` với ngưỡng "số bộ
  còn trả giá cố định" của pick8 (tra `getGameConfig` section `prizes`); nếu vượt, chia tổng
  trần mỗi kỳ của pick8 cho 60 (làm tròn xuống) — không trả nguyên giá cố định.
- "Cược Lớn/Nhỏ tối đa được bao nhiêu tiền?" → Tra `getGameConfig` section `prizes` để lấy bảng
  giải Lớn/Nhỏ, nhân với `betCount` của board.

## Lưu ý dễ sai

- Trần trả thưởng (payout caps) **chỉ** áp dụng bậc trùng cao nhất của pick8/pick9/pick10 —
  các bậc thấp hơn luôn trả đúng giá cố định, không chia sẻ pool.
- Side bet chỉ trả **1 hạng giải duy nhất** mỗi lượt — không cộng gộp nhiều mức trúng cùng lúc
  như một số game khác.
- Tiền giải trong bảng là **per-unit** (ứng với 1 lần tham gia dự thưởng, `betCount = 1`) — luôn
  nhân thêm `betCount` thật của board khi tính tiền lĩnh thực tế, kể cả khi giải đã bị áp trần.
