# Bingo 18 — Điều kiện trúng & cách trả thưởng

> **Số liệu trong tài liệu này:** mọi số tiền giải PHẢI lấy bằng `getGameConfig` cho Bingo 18
> trong chính lượt trả lời (section `prizes`). Tài liệu này chỉ mô tả điều kiện trúng của từng
> cách chơi.

## Bingo 18 không có Jackpot

Khác toàn bộ 3 game xổ số truyền thống (Lotto 5/35, Mega 6/45, Power 6/55), Bingo 18 **không có
Jackpot tích luỹ**. Toàn bộ giải thưởng **cố định** theo cấu hình — không có pool tích luỹ giữa
các kỳ, không có "trúng đặc biệt trao Jackpot". Mỗi board thắng nhận đúng số tiền cố định tương
ứng với điều kiện trúng, không phụ thuộc số kỳ đã trôi qua hay doanh thu.

Bingo 18 cũng **không có payout cap** (khác Keno) — vì giải thưởng đã cố định sẵn, không có cơ
chế "giải biến động theo pool" cần giới hạn trần.

## Điều kiện trúng theo từng cách chơi

### 1. Một số (`singleNum`)

3 mức trúng theo số lần số đã chọn xuất hiện trong 3 số quay:

| Số lần xuất hiện | Trúng? |
| --- | --- |
| 0 lần | Không trúng |
| 1 lần | Trúng — mức 1 |
| 2 lần | Trúng — mức 2 (cao hơn mức 1) |
| 3 lần (cả 3 số quay đều là số đã chọn) | Trúng — mức 3 (cao nhất trong 3 mức) |

Tiền giải mỗi mức tra `getGameConfig` section `prizes`, nhóm bảng giải Một số.

### 2. Hai số trùng nhau (`doubleMatch`)

Chỉ 1 điều kiện thắng: kết quả quay có **≥2 trong 3 số** trùng với số đã chọn (áp dụng cho cả
trường hợp trùng đúng 2 hoặc trùng cả 3 — **không** có mức thưởng riêng cho trùng cả 3, khác
với cách chơi Ba số trùng nhau). Tiền giải tra `getGameConfig` section `prizes`, nhóm bảng giải
Hai số trùng nhau.

### 3. Ba số trùng nhau (`tripleMatch`)

2 biến thể độc lập, mỗi biến thể có tiền giải riêng, tra `getGameConfig` section `prizes`, nhóm
bảng giải Ba số trùng nhau:

| Biến thể | Điều kiện trúng |
| --- | --- |
| Cụ thể (`specific`) | Cả 3 số quay đều đúng số đã chọn |
| Bất kỳ (`any`) | Cả 3 số quay giống nhau (không cần đúng số đã chọn) |

`specific` luôn có tiền giải cao hơn `any` vì xác suất thấp hơn (phải đúng đích danh số đã chọn,
không chỉ cần giống nhau).

### 4. Cộng tổng (`sumTotal`)

Trúng khi tổng 3 số quay đúng bằng giá trị đã chọn (3 đến 18). Tiền giải khác nhau theo từng giá
trị tổng — tra `getGameConfig` section `prizes`, nhóm bảng giải Cộng tổng, theo đúng giá trị
tổng đã chọn.

Quy tắc cố định về độ lớn tương đối: tổng biên (3 hoặc 18) hiếm gặp nhất trong phân phối xác
suất 3 xúc xắc nên **luôn** có tiền giải cao nhất trong nhóm; tổng giữa (10, 11) phổ biến nhất
nên **luôn** có tiền giải thấp nhất trong nhóm. Số tiền cụ thể mỗi mức vẫn phải tra config —
không suy luận theo tỷ lệ xác suất lý thuyết.

### 5. Lớn / Hòa / Nhỏ (`bigSmallDraw`)

Trúng khi tổng 3 số quay rơi vào đúng phạm vi đã đặt cược (Nhỏ / Hòa / Lớn — ranh giới cụ thể là
quy tắc cố định của game). Tiền giải mỗi lựa chọn tra `getGameConfig` section `prizes`, nhóm
bảng giải Lớn/Hòa/Nhỏ.

## `betCount` nhân tiền thắng

Toàn bộ 5 cách chơi đều nhân trực tiếp: `tiền thắng board = tiền giải theo bảng × betCount của
board đó`. Không có cơ chế chia sẻ pool giữa nhiều người chơi (vì giải cố định, không phải
Jackpot).

## Câu hỏi thường gặp

- "Chơi Hai số trùng nhau mà trúng cả 3 số thì có được thưởng thêm không?" → Không. `doubleMatch`
  chỉ có 1 mức thưởng cho điều kiện "≥2 số trùng" — trúng 2 hay trúng cả 3 nhận đúng 1 mức. Muốn
  thưởng riêng cho trúng đúng cả 3, người chơi phải đặt cách chơi Ba số trùng nhau
  (`tripleMatch`).
- "Tổng 10 và tổng 11 tiền giải có bằng nhau không?" → Về mặt cấu trúc bảng, đây là 2 giá trị
  tổng riêng biệt, mỗi giá trị tra cấu hình riêng — phải tra config để biết chính xác, không giả
  định bằng nhau.
