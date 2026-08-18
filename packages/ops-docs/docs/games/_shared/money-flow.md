# Dòng tiền tài chính — 7 sản phẩm game

> **Số liệu trong tài liệu này:** tài liệu này mô tả công thức bằng tên khái niệm — không có số
> cấu hình nào để tra. Muốn biết tỷ lệ/số tiền thật của 1 game, dùng `getGameConfig`.

## Dòng chảy 1 kỳ quay (từ doanh thu đến lợi nhuận)

```
Doanh thu (tổng tiền cược)
   │
   ├── Hoa hồng đại lý (theo % snapshot lúc bán vé)
   │
   ├── Trả thưởng (tổng tiền thắng đã chi cho người chơi)
   │
   ├── (Chỉ 3 game có Jackpot) Đóng góp vào quỹ Jackpot
   │
   └── Phần công ty thu về = phần còn lại sau 3 khoản trên
```

- **Doanh thu** = tổng tiền cược của mọi board/sideBet hợp lệ trong kỳ (đã trừ phần bị hoàn nếu có
  hủy một phần).
- **Hoa hồng đại lý** tính trên doanh thu, theo tỷ lệ **snapshot tại thời điểm mua vé** — không
  phải tỷ lệ cấu hình hiện hành. Đổi hoa hồng sau đó không ảnh hưởng vé đã bán trước đó.
- **Trả thưởng** = tổng tiền thắng của mọi entry trúng trong kỳ, tính theo hạng giải × số lần
  trúng — xem `payout.md` của từng game cho điều kiện trúng.
- **Đóng góp Jackpot** (chỉ Lotto 5/35, Mega 6/45, Power 6/55): phần doanh thu được trích thêm vào
  quỹ Jackpot mỗi kỳ, theo tỷ lệ cấu hình riêng — xem `overview.md` của 3 game này.
- **Phần công ty thu về**: phần doanh thu còn lại sau khi trừ hoa hồng, trả thưởng, và đóng góp
  Jackpot (nếu có). Đây là chỉ số lợi nhuận vận hành của kỳ đó — **có thể âm** ở kỳ có người trúng
  giải lớn hoặc trúng Jackpot.

## Ba nguồn số dễ nhầm

| Câu hỏi | Nguồn ĐÚNG | Nguồn SAI hay bị dùng |
| --- | --- | --- |
| "Hoa hồng đại lý X bao nhiêu %" | Tỷ lệ riêng của đại lý X (nếu có override) | Tỷ lệ mặc định hệ thống từ `getGameConfig` — đây là mặc định, **không** đại diện cho 1 đại lý cụ thể |
| "Kỳ hôm qua trả thưởng bao nhiêu" | Báo cáo/kết quả kỳ đó (đã settle, đã chốt số) | `getGameConfig` hiện hành — cấu hình có thể đã đổi từ sau kỳ đó |
| "Jackpot đang bao nhiêu" | `getGameJackpot` (số dư tích lũy thật) | `seedAmount` trong config — đó là mức khởi điểm của **chu kỳ mới**, không phải số dư hiện tại |

## Vì sao doanh thu, hoa hồng, trả thưởng phải tách bạch 3 nguồn dữ liệu

- **Cấu hình hiện hành** (`getGameConfig`) trả lời "quy tắc/tỷ lệ ĐANG áp dụng cho vé mới", không
  trả lời "kỳ trước đã tính thế nào".
- **Báo cáo kỳ đã settle** trả lời "thực tế kỳ đó đã xảy ra gì", dùng snapshot đã chốt tại thời
  điểm settle — không đổi theo config sau đó.
- **Jackpot live** (`getGameJackpot`) trả lời "số dư tích lũy tại thời điểm hỏi", tách khỏi cả hai
  nguồn trên vì nó thay đổi liên tục theo từng kỳ.

Trộn 3 nguồn này là nguyên nhân phổ biến nhất khiến câu trả lời "đúng công thức, sai số" — công
thức tính không sai, nhưng lấy tỷ lệ/số tiền từ nguồn không phù hợp với câu hỏi.

## Đọc tiếp

- Công thức trả thưởng cụ thể theo hạng giải: `payout.md` của từng game.
- Cơ chế Jackpot (seed, ngưỡng chia/tràn): `overview.md` của Lotto 5/35, Mega 6/45, Power 6/55.
- Vòng đời settle/void/resettle: `ticket-lifecycle.md`.
