# 05 — Lô Live (Live Betting)

**Mục đích**: cho phép cược Lô **trong lúc đang quay thưởng**, giá cược thay đổi động theo **số giải còn lại chưa mở**. Càng ít giải còn lại → xác suất số về càng thấp → giá bán (payout) càng cao.

Đường dẫn: `server/src/services/lottery/services/live`.

BetType: `LoLive=20` (Miền Bắc, 27 giải), `HaiD18LoLive=27` (Miền Nam, 18 giải).

---

## A. Ý tưởng nghiệp vụ

- Một kỳ Lô Live có N giải (MB1: 27, MN: 18). Ban đầu tất cả giải "chưa mở".
- Người điều hành mở lần lượt từng giải (`closePrize`); mỗi lần mở, số lô đã về sẽ trúng, các số còn lại được **định giá lại** theo số giải còn lại.
- Giá bán mỗi giải được tính trước và lưu ở `liveBasePrices` để hot-path cược đọc nhanh.

---

## B. Entities

### B.1 `LiveSettingEntity` — collection `liveSettings`

`infrastructure/entities/live-setting-entity.ts`

| Field                     | Kiểu       | Ý nghĩa                             |
| ------------------------- | ---------- | ----------------------------------- |
| `Term, GameType, BetType` |            | Khóa                                |
| `PrizeNr`                 | number     | Số giải **hiện còn lại** chưa mở    |
| `TotalPrizeNr`            | number     | Tổng số giải (27 / 18)              |
| `Status`                  | LiveStatus | `Closed / Opening / Closing`        |
| `PingAt?`                 | Date       | Lần ping cuối (giữ phiên Live sống) |
| `OpenedPrizes?`           | number[]   | Danh sách giải đã mở                |

### B.2 `LiveBasePriceEntity` — collection `liveBasePrices`

| Field                     | Kiểu   | Ý nghĩa                         |
| ------------------------- | ------ | ------------------------------- |
| `Term, GameType, BetType` |        | Khóa                            |
| `PrizeNr`                 | number | Ứng với số giải còn lại nào     |
| `Price`                   | number | Giá bán cơ bản ở mức PrizeNr đó |
| `Payouts`                 | number | Tỷ lệ trả thưởng                |
| `Profit`                  | number | Lợi nhuận kỳ vọng của nhà cái   |
| `Probability`             | number | Xác suất số về                  |

→ Với mỗi (Term, GameType), có một dãy base-price cho từng giá trị `PrizeNr` từ TotalPrizeNr xuống 1.

---

## C. Công thức tính giá cơ bản Lô Live MB1 — `calculateMienBac1LoLiveInternal`

Tính cho từng `PrizeNr` (số giải còn lại). Các bước:

1. **Xác suất số về** (còn `prizeNr` giải, lô 2 chữ số 00-99):

```
Probability = 1 − ((99/100) ^ prizeNr)   // xác suất ít nhất 1 trong prizeNr giải trùng
```

2. **Lợi nhuận mục tiêu (nội suy tuyến tính)** giữa `MinProfit` (khi còn ít giải) và `MaxProfit` (khi còn nhiều giải), theo tỷ lệ `prizeNr / TotalPrizeNr`:

```
Profit = MinProfit + (MaxProfit − MinProfit) × (prizeNr / TotalPrizeNr)
```

3. **Giá tương đương (Equivalent Price)** = giá hoà vốn theo xác suất:

```
EquivalentPrice = Payouts × Probability      // kỳ vọng chi trả trên 1 điểm
```

4. **Giá bán (đã cộng lợi nhuận)** và làm tròn về đơn vị bán:

```
Price = EquivalentPrice / (1 − Profit)       // cộng biên lợi nhuận
Price = roundToSellingUnit(Price)            // làm tròn theo đơn vị bán ra
```

> Giá tăng dần khi `prizeNr` giảm (còn ít giải → Probability giảm → EquivalentPrice giảm nhưng Payouts giữ, dẫn tới giá bán điều chỉnh để giữ Profit mục tiêu). Chi tiết hằng số nằm trong `parameter` (`MinProfit`, `MaxProfit`, `Payouts`, `Probability`).

Kết quả mỗi `prizeNr` được ghi 1 bản ghi `LiveBasePriceEntity`.

---

## D. Luồng vận hành

```
[Tạo kỳ] term.createTerms → liveSettingHelper.buildEntity (Status=Closed, PrizeNr=TotalPrizeNr)
   │
[makeOdds] tính toàn bộ liveBasePrices cho mọi mức PrizeNr (chạy trước khi mở)
   │
[openGames] Status Closed→Opening; publish LO_LIVE_OPENING_EVENT
   │
[ping]  client/worker ping giữ phiên (PingAt); nếu quá MaxPingInSecondsForLoLive (5s) → có thể tự đóng
   │
[closePrize] mở 1 giải: nhập số về giải đó → bookkeeping tính trúng ngay
   │            → PrizeNr giảm 1 → publish LO_LIVE_PRIZE_CLOSED_EVENT
   │            → định giá lại (extra-price lo-live-change-by-point qua SQS)
   │            → RemoveExtraPrice (nếu parameter cấu hình) xoá bớt giá tăng khi số đã về
   │
[closeGames] đóng phiên Live: Status→Closed, publish LO_LIVE_CLOSED_EVENT
```

- **`LiveAutomaticException`** (xem file 04): khi mở giải làm số đã về, worker auto lưu `AutomaticPrice` hiện tại làm ngưỡng; lần tăng sau chỉ tăng nếu giá tính được vượt ngưỡng — tránh dội giá.
- `DefaultLoLiveLastPrizeNr=1`: giải cuối cùng.

---

## E. Events

`internal-events/types/lottery-internal-event.ts`: `LO_LIVE_OPENING_EVENT`, `LO_LIVE_PRIZE_CLOSED_EVENT`, `LO_LIVE_CLOSED_EVENT`. Publish qua SNS bus + realtime channel để client cập nhật bảng giá tức thì.

---

## F. Khác biệt cược Live so với cược thường (liên quan file 07 & 11)

- `term.canBetNow`: với BetType Live **bỏ qua kiểm tra giờ đóng** (`LiveBetTypeList.includes(betType) → return true`) — đóng/mở do `liveSetting.Status` quyết định.
- Tính tiền dùng `getPlayerPayAmountLive` / `getIncomeAndCommission` nhánh Live (file 07).
- Dò trúng dùng `PrizeNr` để xác định giải nào đã về (file 11).

---

## G. API / Worker

- Agent: `makeOdds`, `openGames`, `closePrize`, `closeGames`, get live-settings / base-prices. Quyền cần `WriteLoLive`.
- Player: xem base-prices / trạng thái Live (realtime).
- Ping worker giữ phiên; SQS `lo-live-change-by-point` định giá lại.

---

## H. Gợi ý khi xây lại

1. **Tính trước toàn bộ base-price cho mọi mức PrizeNr** (`makeOdds`) là chìa khoá cho hot-path — không tính runtime khi cược.
2. Công thức `Probability = 1 − (99/100)^prizeNr` và nội suy Profit min↔max là mô hình định giá cốt lõi; tổng quát hoá cho đài có số giải khác nhau qua `TotalPrizeNr`.
3. Cần đồng bộ chặt giữa `closePrize` (dò trúng ngay) và định giá lại — dùng event + SQS như hiện tại để tách tải.
4. Cơ chế `RemoveExtraPrice` + `LiveAutomaticException` chống dội giá sau khi số đã về — quan trọng để giá Live mượt.
