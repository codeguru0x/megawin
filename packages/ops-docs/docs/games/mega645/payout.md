# Mega 6/45 — Điều kiện trúng & cách trả thưởng

> **Số liệu trong tài liệu này:** mọi số tiền giải, ngưỡng Jackpot PHẢI lấy bằng
> `getGameConfig`/`getGameJackpot` cho Mega 6/45 trong chính lượt trả lời. Tài liệu này chỉ mô tả
> điều kiện trúng và cơ chế Jackpot.

## 4 hạng giải, xét từ cao xuống thấp

Mỗi line chỉ nhận **đúng 1 hạng giải cao nhất** phù hợp — hệ thống chỉ dựa trên số lượng số
trùng (`matchCount`), không có khái niệm số đặc biệt:

| Hạng | Điều kiện trúng |
| --- | --- |
| Giải Đặc Biệt (Jackpot) | Trùng cả 6/6 số |
| Giải Nhất | Trùng 5/6 số |
| Giải Nhì | Trùng 4/6 số |
| Giải Ba | Trùng 3/6 số |

Board chơi cơ bản chỉ có 1 line nên chỉ nhận đúng 1 hạng. Board chơi bao sinh nhiều line, **mỗi
line xét độc lập** — 1 board bao có thể trúng nhiều hạng khác nhau trên các line khác nhau cùng
lúc, nhưng Jackpot (6/6) chỉ có thể trúng **tối đa 1 line** trong 1 board dù chơi bao cỡ nào (vì
chỉ có duy nhất 1 tổ hợp 6 số khớp hoàn toàn kết quả).

## Tiền giải theo betCount

Tiền thắng của 1 line trúng Giải Nhất/Nhì/Ba = tiền giải theo hạng (từ config) × `betCount` của
board chứa line đó. Tổng tiền thắng của 1 board (khi chơi bao) = tổng tiền thắng của tất cả line
trúng thuộc board đó.

## Cơ chế Jackpot — chỉ tích luỹ, KHÔNG chia giải

### Tích luỹ

Mỗi kỳ sau khi settle, phần doanh thu còn lại sau khi trừ giải cố định, hoa hồng đại lý, và phần
công ty thu về sẽ được cộng vào số dư Jackpot đang tích luỹ. Nếu doanh thu kỳ đó không đủ bù các
khoản trên, phần đóng góp vào Jackpot kỳ đó = 0 (không bao giờ trừ âm vào Jackpot).

### Khi không có người trúng Jackpot

Toàn bộ số dư **cộng dồn (roll-over) sang kỳ tiếp theo**, không giới hạn số kỳ tích luỹ liên
tiếp. Giải Nhất, Nhì, Ba luôn giữ giá trị cố định theo config bất kể Jackpot đã tích luỹ bao
nhiêu — **Mega 6/45 không có cơ chế chia giải Jackpot xuống các hạng dưới** (khác với Lotto 5/35).

### Khi có người trúng Jackpot

Người trúng nhận toàn bộ số dư Jackpot tại thời điểm đó. Nếu có nhiều người cùng trúng trong 1
kỳ, số dư được **chia theo tỷ lệ betCount** của từng người trúng (không chia đều theo đầu người)
— người có `betCount` cao hơn nhận phần lớn hơn tương ứng. Sau khi trao thưởng, cycle mới mở lại
từ mức khởi điểm (seed).

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Tiền giải 3 hạng cố định (tier1-3) | `getGameConfig` section `prizes` |
| Số tiền khởi điểm 1 cycle Jackpot mới | `getGameConfig` section `jackpot` |
| Số Jackpot đang tích luỹ hiện tại (live) | `getGameJackpot` |

## Câu hỏi thường gặp của nhân viên

- "Giải Nhất Mega 6/45 hiện tại bao nhiêu?" → `getGameConfig` section `prizes`, nhóm giải cố định
  theo bậc (tier).
- "Jackpot không ai trúng thì sao?" → Cộng dồn hết sang kỳ sau, không chia cho giải nào — khác
  Lotto 5/35 (có ngưỡng chia giải).
- "2 người cùng trúng Jackpot, ai nhận nhiều hơn?" → Người có `betCount` cao hơn nhận phần lớn
  hơn theo tỷ lệ, không chia đều theo đầu người.

## Lưu ý dễ sai

- Đừng áp dụng khái niệm "chia giải Jackpot" (split cycle) của Lotto 5/35 sang Mega 6/45 — Mega
  6/45 **không có** cơ chế này.
- Mức khởi điểm ("seed") của cycle Jackpot mới **không phải** số dư Jackpot hiện tại. Luôn dùng
  `getGameJackpot` khi được hỏi "Jackpot đang bao nhiêu".
- Nhiều người trúng Jackpot cùng kỳ chia theo **tỷ lệ betCount**, không chia đều theo số người
  trúng.
