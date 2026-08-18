# Power 6/55 — Điều kiện trúng & cách trả thưởng

> **Số liệu trong tài liệu này:** mọi số tiền giải, tỷ lệ, ngưỡng Jackpot PHẢI lấy bằng
> `getGameConfig`/`getGameJackpot` cho Power 6/55 trong chính lượt trả lời. Tài liệu này chỉ mô
> tả điều kiện trúng và cơ chế dual Jackpot/overflow — phần phức tạp nhất trong 7 game.

## 5 hạng giải, xét từ cao xuống thấp

Mỗi line chỉ nhận **đúng 1 hạng giải cao nhất** phù hợp, xét dựa trên số lượng số chính trùng
**và** việc số còn lại (nếu có) có trùng bonus number hay không:

| Hạng | Điều kiện trúng |
| --- | --- |
| Jackpot 1 | Trùng đủ 6/6 số chính |
| Jackpot 2 | Trùng 5/6 số chính, và số còn lại trùng bonus number |
| Giải Nhất | Trùng 5/6 số chính, số còn lại **không** trùng bonus number |
| Giải Nhì | Trùng 4/6 số chính |
| Giải Ba | Trùng 3/6 số chính |

Vì bonus number luôn khác 6 số kết quả chính, **1 line duy nhất không bao giờ đồng thời thoả cả
2 điều kiện Jackpot** — line trùng đủ 6/6 chỉ có thể là Jackpot 1, line trùng 5/6 chỉ có thể xét
Jackpot 2 hoặc Giải Nhất tuỳ có trùng bonus hay không.

Khi chơi bao, 1 board sinh nhiều line độc lập — vì vậy 1 board bao **có thể** đồng thời có 1 line
trúng Jackpot 1 và một số line khác trúng Jackpot 2 hoặc các hạng thấp hơn.

## Tiền giải theo betCount

Tiền thắng của 1 line trúng Giải Nhất/Nhì/Ba = tiền giải theo hạng (từ config) × `betCount` của
board chứa line đó. Người trúng Jackpot (1 hoặc 2) nhận theo cơ chế chia tỷ lệ betCount mô tả
dưới đây, không đơn giản là "tiền giải × betCount".

## Cơ chế tích luỹ 2 Jackpot song song

Mỗi kỳ, phần doanh thu còn lại sau khi trừ giải cố định, hoa hồng đại lý, phần công ty thu về
được chia theo tỷ lệ cố định giữa Jackpot 1 và Jackpot 2 (JP1 nhận phần lớn hơn nhiều so với
JP2). Cả 2 số dư tích luỹ độc lập, cộng dồn qua từng kỳ chưa có người trúng tương ứng.

### Cơ chế Overflow — khi JP1 vượt ngưỡng

Kích hoạt **chỉ khi đồng thời** thoả 3 điều kiện: JP1 đã vượt ngưỡng overflow cấu hình, **không**
có ai trúng JP1 trong kỳ đó, và **có** người trúng JP2 trong kỳ đó.

- Nếu **có** người trúng JP1 trong kỳ: overflow không kích hoạt dù JP1 đã vượt ngưỡng — người
  trúng JP1 nhận toàn bộ số dư JP1 (không bị giới hạn bởi ngưỡng), JP2 chỉ nhận phần đóng góp
  bình thường của kỳ đó.
- Nếu **không** ai trúng JP1 nhưng **có** người trúng JP2 và JP1 đã vượt ngưỡng: phần vượt ngưỡng
  của JP1 được **chuyển sang trả thêm cho người trúng JP2** kỳ đó; số dư JP1 giữ nguyên ở mức
  ngưỡng cho kỳ sau.
- Nếu **không ai trúng cả JP1 và JP2**: JP1 tiếp tục tăng vượt ngưỡng bình thường, không bị giới
  hạn (chờ đến khi có đủ điều kiện overflow hoặc có người trúng JP1).

### Khi có người trúng Jackpot (1 hoặc 2)

Người trúng nhận toàn bộ số dư Jackpot tương ứng tại thời điểm đó. Nếu có nhiều người cùng trúng
1 loại Jackpot trong 1 kỳ, số dư được **chia theo tỷ lệ betCount** của từng người trúng (người
`betCount` cao hơn nhận phần lớn hơn tương ứng, không chia đều theo đầu người).

- **Sau khi có người trúng Jackpot 1**: cycle JP1 đóng lại, mở cycle mới từ mức khởi điểm (seed).
  Jackpot 2 **không** reset theo — vẫn giữ số dư hiện tại và tiếp tục tích luỹ (trừ khi cùng kỳ
  đó JP2 cũng có người trúng, thì JP2 mới reset về seed).
- **Sau khi có người trúng Jackpot 2 (mà JP1 không trúng)**: chỉ JP2 reset về mức khởi điểm; JP1
  tiếp tục tích luỹ không bị ảnh hưởng.

## Số liệu cần tra cấu hình

| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Tiền giải 3 hạng cố định (tier1-3) | `getGameConfig` section `prizes` |
| Số tiền khởi điểm mỗi cycle của JP1, JP2 | `getGameConfig` section `jackpot` |
| Tỷ lệ JP1/JP2 nhận từ phần tích luỹ | `getGameConfig` section `jackpot` |
| Ngưỡng overflow của JP1 | `getGameConfig` section `jackpot` |
| Số dư Jackpot 1, Jackpot 2 hiện tại (live) | `getGameJackpot` |

## Câu hỏi thường gặp của nhân viên

- "Trùng 5/6 mà không trùng bonus là giải gì?" → Giải Nhất (không phải Jackpot 2 — Jackpot 2 bắt
  buộc phải trùng thêm bonus number).
- "JP1 vượt ngưỡng mà không ai trúng cả 2 jackpot thì sao?" → Overflow không kích hoạt, JP1 tiếp
  tục tăng vượt ngưỡng bình thường sang kỳ sau.
- "Người trúng JP2 có ảnh hưởng đến JP1 không?" → Không, JP2 reset riêng, JP1 không bị ảnh hưởng
  trừ khi kỳ đó cũng có overflow chuyển từ JP1 sang JP2.

## Lưu ý dễ sai

- Overflow **yêu cầu đủ cả 3 điều kiện** — thiếu 1 trong 3 (VD: JP1 chưa vượt ngưỡng, hoặc không
  có ai trúng JP2) thì cơ chế này không áp dụng.
- Người trúng Jackpot 2 **không** làm đóng cycle JP1 — chỉ người trúng Jackpot 1 mới đóng cycle
  và reset seed.
- 1 line không bao giờ trúng đồng thời cả JP1 và JP2 — chỉ 1 board chơi bao (nhiều line) mới có
  thể trúng cả hai qua các line khác nhau.
