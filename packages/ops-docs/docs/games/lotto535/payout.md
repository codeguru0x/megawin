# Lotto 5/35 — Điều kiện trúng & cách trả thưởng

> **Số liệu trong tài liệu này:** mọi số tiền giải, tỷ lệ, ngưỡng Jackpot PHẢI lấy bằng
> `getGameConfig`/`getGameJackpot` cho Lotto 5/35 trong chính lượt trả lời. Tài liệu này chỉ mô
> tả điều kiện trúng và cơ chế Jackpot/chia giải.

## 7 hạng giải, xét từ cao xuống thấp

Mỗi line chỉ nhận **đúng 1 hạng giải cao nhất** phù hợp — hệ thống xét từ Jackpot xuống dần,
dừng lại ở hạng đầu tiên thoả điều kiện:

| Hạng | Điều kiện trúng |
| --- | --- |
| Giải Độc Đắc (Jackpot) | Trùng cả 5 số chính + số đặc biệt |
| Giải Nhất | Trùng cả 5 số chính, không trùng số đặc biệt |
| Giải Nhì | Trùng 4 số chính + số đặc biệt |
| Giải Ba | Trùng 4 số chính, không trùng số đặc biệt |
| Giải Tư | Trùng 3 số chính + số đặc biệt |
| Giải Năm | Trùng 3 số chính, không trùng số đặc biệt |
| Giải Khuyến Khích | Trùng số đặc biệt và ≤ 2 số chính (kể cả 0 số chính) |

Board chơi cơ bản chỉ có 1 line nên chỉ nhận đúng 1 hạng. Board chơi bao sinh nhiều line, **mỗi
line xét độc lập** — vì vậy 1 board bao có thể trúng nhiều hạng khác nhau trên các line khác
nhau cùng lúc (VD: 1 line trúng Jackpot, các line còn lại trúng Giải Nhì).

## Tiền giải theo betCount

Tiền thắng của 1 line = tiền giải theo hạng (từ config) × `betCount` của board chứa line đó.
Tổng tiền thắng của 1 board (khi chơi bao) = tổng tiền thắng của tất cả line trúng thuộc board
đó.

## Cơ chế Jackpot

### Tích luỹ

Mỗi kỳ sau khi settle, phần doanh thu còn lại sau khi trừ giải cố định, hoa hồng đại lý, và phần
công ty thu về sẽ được cộng vào số dư Jackpot đang tích luỹ. Nếu doanh thu kỳ đó không đủ bù các
khoản trên, phần đóng góp vào Jackpot kỳ đó = 0 (không bao giờ trừ âm vào Jackpot).

### Vòng đời 1 cycle

Jackpot bắt đầu mỗi cycle từ mức khởi điểm (seed). Mỗi kỳ settle, số dư được cộng thêm phần đóng
góp. Cycle kết thúc và mở cycle mới (reset về mức khởi điểm) khi xảy ra 1 trong các trường hợp:
có người trúng Jackpot, kỳ đó kích hoạt chia giải, hoặc quản trị viên reset thủ công.

### Chia giải (Split cycle)

Kích hoạt khi **đồng thời** thoả 3 điều kiện: Jackpot tích luỹ đã đạt ngưỡng chia giải, không ai
trúng Jackpot trong kỳ đó, và đây là kỳ cuối cùng trong ngày (kỳ tối).

Khi kích hoạt, toàn bộ số dư Jackpot được chia theo tỷ lệ cố định cho 5 hạng giải cố định
(tier1-tier5) — Giải Khuyến Khích **không** tham gia chia. Phần chia của 1 hạng nếu không có
người trúng ở hạng đó sẽ được dồn (redistribute) sang các hạng khác đang có người trúng trong
cùng lần chia. Người trúng ở các hạng có tham gia chia nhận thêm phần bonus này **cộng thêm**
vào tiền giải cố định thường lệ của hạng đó.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Tiền giải 6 hạng cố định (tier1-5, consolation) | `getGameConfig` section `prizes` |
| Số tiền khởi điểm 1 cycle Jackpot mới | `getGameConfig` section `jackpot` |
| Ngưỡng kích hoạt chia giải | `getGameConfig` section `jackpot` |
| Tỷ lệ chia Jackpot cho từng hạng (tier1-5) | `getGameConfig` section `jackpot` |
| Số Jackpot đang tích luỹ hiện tại (live) | `getGameJackpot` |

## Câu hỏi thường gặp của nhân viên

- "Giải Nhì hiện tại bao nhiêu tiền?" → `getGameConfig` section `prizes`, nhóm giải cố định theo
  bậc (tier).
- "Jackpot bao nhiêu thì chia giải?" → So `getGameJackpot` (số dư live) với ngưỡng chia giải lấy
  từ `getGameConfig` section `jackpot` — chia giải chỉ xảy ra ở kỳ tối và khi không ai trúng
  Jackpot kỳ đó.
- "Trúng 4 chính không trúng đặc biệt là giải gì?" → Giải Ba (không nhầm với Giải Nhì — Giải Nhì
  cần trùng thêm số đặc biệt).

## Lưu ý dễ sai

- Giải Khuyến Khích **không** tham gia chia Jackpot — kể cả khi kỳ đó kích hoạt split cycle,
  người trúng Giải Khuyến Khích chỉ nhận đúng tiền giải cố định, không có bonus.
- Chia giải Jackpot **chỉ** xảy ra ở kỳ cuối cùng trong ngày — kỳ trưa không bao giờ kích hoạt
  chia giải dù Jackpot đã vượt ngưỡng.
- `seedAmount` là mức khởi điểm của **cycle mới** — không phải số dư Jackpot hiện tại. Luôn dùng
  `getGameJackpot` khi được hỏi "Jackpot đang bao nhiêu".
