# 10 — Lottery Result (Kết quả xổ số)

**Mục đích**: nhập, lưu, và công bố kết quả các đài xổ số. Là đầu vào cho toàn bộ quá trình kết sổ (file 11).

Đường dẫn: `server/src/services/lottery/services/lottery-result`.

---

## A. Phân loại kết quả — `LotteryResultType` (`entities/lottery-result.ts:36`)

| Value | Type               | Đài áp dụng                                  |
| ----- | ------------------ | -------------------------------------------- |
| 0     | `Northern`         | Miền Bắc (dùng chung cho **MB1** và **MB2**) |
| 1     | `Southern18A`      | Miền Nam 18A                                 |
| 2     | `Southern18B`      | Miền Nam 18B                                 |
| 3     | `Southern18C`      | Miền Nam 18C                                 |
| 4     | `NorthernCaishen4` | Thần Tài 4 số (MB)                           |

> **Quan trọng**: MB1 và MB2 dùng CHUNG một kết quả `Northern`. MB1 dùng thêm `NorthernCaishen4` (Thần Tài). Đài `MienNam18Ava18B` dùng cả kết quả 18A và 18B để dò Xiên ghép.

Tất cả collection: `lotteryResults`, phân biệt bằng field `Type`.

## B. Base fields — `LotteryResultBaseEntity` (`:6`)

| Field       | Kiểu              | Ý nghĩa                                      |
| ----------- | ----------------- | -------------------------------------------- |
| `Term`      | string            | Kỳ mở thưởng `YYYY-MM-DD` (mỗi ngày 1 phiên) |
| `Date`      | Date              | Ngày quay thưởng                             |
| `CityName?` | string            | Đài/thành phố                                |
| `Type`      | LotteryResultType | Loại kết quả                                 |

## C. Kết quả Miền Bắc — `NorthernLotteryResultEntity` (`:68`)

| Giải     | Field     | Số lượng     | Ghi chú  |
| -------- | --------- | ------------ | -------- |
| Đặc biệt | `Jackpot` | string (1)   |          |
| Nhất     | `First`   | string (1)   |          |
| Nhì      | `Second`  | string[] (2) |          |
| Ba       | `Third`   | string[] (6) |          |
| Tư       | `Fourth`  | string[] (4) |          |
| Năm      | `Fiveth`  | string[] (6) |          |
| Sáu      | `Sixth`   | string[] (3) |          |
| Bảy      | `Seventh` | string[] (4) | 2 chữ số |

→ **Tổng 27 giải** (khớp `DefaultLoLive27PrizeNr = 27`). Lô lấy 2 số cuối của mỗi giải.

## D. Kết quả Miền Nam — `SouthernLotteryResultEntity` (`:131`)

| Giải     | Field     | Số lượng     |
| -------- | --------- | ------------ |
| Đặc biệt | `Jackpot` | string (1)   |
| Nhất     | `First`   | string (1)   |
| Nhì      | `Second`  | string (1)   |
| Ba       | `Third`   | string[] (2) |
| Tư       | `Fourth`  | string[] (7) |
| Năm      | `Fiveth`  | string (1)   |
| Sáu      | `Sixth`   | string[] (3) |
| Bảy      | `Seventh` | string (1)   |
| Tám      | `Eighth`  | string (1)   |

→ **Tổng 18 giải** (khớp `DefaultLoLive18PrizeNr = 18`).

## E. Kết quả Thần Tài — `Caishen4LotteryResultEntity` (`:202`)

`{ ...base, Result: string /* 4 chữ số */ }`. Dùng cho các kiểu Đề/2D/3D/4D Thần Tài của MB2.

---

## F. Nhập kết quả

Hai chế độ:

1. **Nhập trọn kỳ** (`updateResult`): nhập toàn bộ giải một lần → dùng cho kết sổ thường.
2. **Nhập từng giải (Live)** (`updateResultLive`): với Lô Live, mỗi lần `closePrize` (file 05) nhập số của một giải → dò trúng ngay theo `PrizeNr` còn lại.

Sau khi nhập:

- Lưu vào `lotteryResults` (theo `Type`).
- **Xoá cache** `lotto:lottery-result:all-lottery-results-by-date:{date}` (TTL 3 phút).
- Kiểm tra "sẵn sàng kết sổ" (term `list-by-date?checkBookKeepingReady=true`, file 01): MB1 cần cả `NorthernCaishen4` + `Northern`; MB2 cần `Northern`; MN18A/B/C cần `Southern` tương ứng; 18Ava18B cần cả 18A và 18B.

---

## G. Đọc kết quả (public)

- `getResultByTerm({term, type})` — dùng bởi bookkeeping (file 11).
- API public xem kết quả theo ngày (cache 3 phút).

---

## H. API endpoints

**Agent** (quyền `WriteGame` để nhập):

- `PUT /agent/result` — nhập kết quả trọn kỳ.
- `PUT /agent/result/live` — nhập từng giải cho Live.

**Public/Player**:

- `GET /result/by-date/{date}` — xem kết quả (cached).
- `GET /result/{term}/{type}`.

---

## I. Gợi ý khi xây lại

1. **Chuẩn hoá kết quả theo `Type` + cấu trúc giải rõ ràng** — MB (27 giải) và MN (18 giải) khác nhau về số lượng giải và độ dài số; số giải khớp với `TotalPrizeNr` của Lô Live.
2. **Tách chế độ nhập trọn kỳ vs từng giải (Live)** để hỗ trợ dò trúng realtime.
3. Cache theo ngày TTL ngắn (3 phút) + xoá chủ động khi cập nhật.
4. Cơ chế "checkBookKeepingReady" đảm bảo không kết sổ khi thiếu kết quả (đặc biệt MB1 cần cả Northern + Caishen4).
