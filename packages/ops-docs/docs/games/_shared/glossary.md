# Từ vựng chung — 7 sản phẩm game

> **Số liệu trong tài liệu này:** tài liệu này giải thích khái niệm và quan hệ dùng chung — không
> có số cấu hình nào để tra. Dùng làm nền để đọc 3 tài liệu riêng của từng game (`overview`,
> `how-to-play`, `payout`), nơi mọi con số PHẢI lấy bằng `getGameConfig`.

## Đơn vị mua vé

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| **Ticket (vé)** | 1 lần mua, có thể chứa nhiều board và chơi cho nhiều kỳ liên tiếp cùng lúc. |
| **Board (panel)** | 1 lựa chọn chơi độc lập trong vé, đặt tên bằng chữ cái (A, B, C…). **Số board tối đa mỗi vé là CẤU HÌNH riêng theo game** — luôn tra `getGameConfig` section `play`, KHÔNG giả định dải chữ cái nào và KHÔNG suy từ game khác. Một số game (Keno, Bingo 18) sinh `boardNo` tự động liên tục; các game còn lại tên board do phía đặt vé gửi lên. |
| **PlayType / PlayMode** | Cách chơi của 1 board (VD: chọn số cơ bản, chơi bao, chơi tổ hợp, chơi cặp bộ ba…). Mỗi game có bộ cách chơi riêng — xem `how-to-play.md` của game đó. |
| **Line** | 1 tổ hợp số cụ thể được so khớp với kết quả quay. Chơi cơ bản (standard) luôn có đúng 1 line; chơi bao/tổ hợp sinh ra nhiều line từ 1 board. Số line được **tính**, không phải nhân viên nhập tay — công thức thuộc phần cách chơi của từng game. |
| **betCount** | Số lần tham gia dự thưởng nhân bội mà người chơi chọn cho 1 board (mặc định là 1, có sàn/trần riêng theo game — xem "Số liệu cần tra cấu hình" ở `overview.md`). Tiền cược và tiền thắng của board đều nhân theo `betCount`, không phải nhân theo số line. |
| **betUnitCount** | Đại lượng dùng để tính tiền của 1 board hoặc 1 entry: gộp cả số line và betCount lại. Đây là cơ sở nhân với mệnh giá để ra tổng tiền — **không nhầm với số line**, vì 1 board chơi bao có nhiều line nhưng betCount vẫn là một số riêng nhân thêm vào mỗi line. |
| **Kỳ liên tiếp (multi-draw)** | 1 vé có thể mua cho nhiều kỳ quay liên tiếp cùng lúc (giá nhân theo số kỳ). Số kỳ tối đa khác nhau theo game. |

## Vòng đời dữ liệu khi 1 vé được chơi nhiều kỳ

```
Ticket (1 lần mua, N board, M kỳ liên tiếp)
   └── Entry (1 ticket × 1 kỳ quay cụ thể) — đơn vị để settle
          └── Board snapshot (bản chụp lựa chọn của board tại kỳ đó)
                 └── Line (từng tổ hợp số cụ thể được so khớp kết quả)
```

- **Entry** là đơn vị settle: 1 vé chơi N kỳ liên tiếp sẽ tạo ra N entry, mỗi entry settle độc lập
  khi kỳ đó có kết quả.
- Một số game (các game có chơi bao/tổ hợp) tạo **line** thật trong lúc settle để lưu vết đối
  soát; các game chơi đơn giản (Keno, Bingo 18) so khớp trực tiếp trên board, không tạo line.

## Đại lý (tenant) và hoa hồng

- Toàn hệ thống Backoffice quản lý nhiều đại lý (tenant) bán vé cho MegaWin.
- Mỗi tenant có thể có **hoa hồng riêng**, khác với hoa hồng mặc định của game. Hoa hồng được
  **chụp lại (snapshot)** vào thời điểm mua vé — sửa hoa hồng sau đó không ảnh hưởng vé đã bán.
- Vì vậy câu hỏi "hoa hồng của đại lý X là bao nhiêu" **không** trả lời bằng số mặc định của
  game — xem `_shared/money-flow.md`.

## Kết quả trúng thưởng

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| **Prize tier (hạng giải)** | Một mức giải cụ thể (VD: giải nhất, giải nhì…). Mỗi game có bộ hạng giải riêng — xem `payout.md` của game đó. |
| **matchCount** | Số lượng số của người chơi trùng với kết quả quay — cơ sở để xác định hạng giải trúng ở các game chọn-số-từ-tập-số. |
| **Gộp giải vs. hạng cao nhất** | Một số game chỉ trả **hạng cao nhất** khi trúng nhiều hạng cùng lúc; một số game (đặc biệt Max 3D+ và Max 3D Pro) trả **gộp tất cả** hạng đã trúng. Quy tắc này khác nhau theo game — luôn kiểm tra `payout.md` tương ứng, không suy diễn từ game khác. |
| **Payout / trả thưởng** | Quá trình chuyển tiền thắng cho đại lý sau khi kỳ đã settle. |

## Vòng đời & thao tác vận hành

Xem chi tiết trạng thái và quy trình ở `_shared/ticket-lifecycle.md`. Các động từ hay gặp:

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| **Settle (kết sổ)** | Tính kết quả trúng thưởng + tài chính cho 1 kỳ sau khi có kết quả quay chính thức. |
| **Void (hủy kỳ)** | Hủy 1 kỳ quay (do lỗi vận hành) — toàn bộ entry của kỳ đó được hoàn tiền, không tính là đã chơi. |
| **Kết sổ lại (resettle)** | Sửa kết quả một kỳ đã công bố rồi settle lại. Có hướng dẫn thao tác riêng cho 3 game có Jackpot ở topic "Kết sổ lại (Resettle)" — không nhầm với `payout.md`. |

## Đọc tiếp

- Muốn biết cơ chế cụ thể của 1 game (loại số, lịch quay, số board tối đa): đọc `overview.md`
  của game đó.
- Muốn biết cách đặt cược, chơi bao/tổ hợp, cách tính tiền: đọc `how-to-play.md`.
- Muốn biết điều kiện trúng và cách trả thưởng: đọc `payout.md`.
- Muốn biết vòng đời trạng thái kỳ quay/vé chi tiết: đọc `_shared/ticket-lifecycle.md`.
- Muốn biết dòng tiền doanh thu → hoa hồng → giải thưởng → lợi nhuận: đọc `_shared/money-flow.md`.
