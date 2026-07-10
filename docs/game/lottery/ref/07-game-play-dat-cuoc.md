# 07 — Game Play (Đặt cược) — Ticket / Ticket-Item & State Machine

**Mục đích**: đây là **lõi giao dịch**. Nhận yêu cầu cược từ Player, validate (số dừng, giới hạn, số dư), tính tiền player trả + income/commission từng cấp đại lý, trừ tiền, lưu phiếu, cập nhật thống kê.

Đường dẫn: `server/src/services/lottery/services/game-play`.

---

## A. Vòng đời một phiếu cược

```
POST /player/place-betting (API)
   │  → validate cơ bản (Joi), rate-limit (Redis), canBetNow
   │  → createTX (DynamoDB, idempotency theo TransactionId)
   │  → đẩy vào Kinesis (LOTTERY_GAME_PLAY_PLACE_BETTING)
   ▼
Step Function (state machine đặt cược)
   ├─ prepare              : đọc TX từ DynamoDB, build shareHolders + giá + income/commission
   ├─ validate-stop-number : chặn số bị dừng (user + ancestors)
   ├─ validate-game-setting: chặn vượt maxPointCanBetPerNumber, tổng %thầu=100, giá cấp hợp lệ
   ├─ withdraw-balance     : trừ tiền ví player
   ├─ save-ticket          : ghi ticket + ticketItems + counter; nếu fail → deposit hoàn tiền
   └─ notify               : publish realtime + đẩy stats / outstanding / player-ip-bet
```

> Payload đầy đủ nằm ở DynamoDB (`PlaceBettingTxEntity`), state machine chỉ chuyền object gọn `TicketTXStateMachine` → tránh giới hạn 256KB của Step Functions.

---

## B. Entities

### B.1 `TicketEntity` — collection `tickets`

| Field                                      | Kiểu         | Ý nghĩa                               |
| ------------------------------------------ | ------------ | ------------------------------------- |
| `TicketNr`                                 | string       | Mã phiếu (sinh từ `counters`)         |
| `TransactionId`                            | string       | Idempotency key                       |
| `PlayerId, PlayerUsername, Path, ParentId` |              | Người cược & cây                      |
| `Term, GameType, BetType`                  |              | Kỳ / đài / kiểu cược                  |
| `TotalPoint`                               | Long         | Tổng điểm phiếu                       |
| `TotalPayAmount`                           | Decimal128   | Tổng tiền player trả                  |
| `Status`                                   | TicketStatus | `Valid / Canceled / ...`              |
| `Ip, UserAgent`                            |              | Thiết bị (risk-management)            |
| `CreatedAt`                                | Date         |                                       |
| `CancelLimit`                              | Date         | Thời điểm được phép huỷ đến (file 08) |

### B.2 `TicketItemEntity` — collection `ticketItems`

Mỗi phiếu gồm nhiều item (mỗi item = 1 nhóm số cùng giá). Chứa mảng `ShareHolders` (income/commission từng cấp) — **đơn vị dò trúng & tính thắng thua** trong bookkeeping (file 11).

| Field                                                 | Kiểu                    | Ý nghĩa                                                                              |
| ----------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `TicketNr, PlayerId, Path, Term, GameType, BetType`   |                         | Kế thừa từ ticket                                                                    |
| `Numbers`                                             | string[]                | Các số trong item                                                                    |
| `Point`                                               | Long                    | Điểm mỗi số                                                                          |
| `NewPrice`                                            | number                  | Giá player mua (base + extra)                                                        |
| `Payouts`                                             | number                  | Tỷ lệ trả thưởng                                                                     |
| `PayAmount`                                           | Decimal128              | Tiền player trả cho item                                                             |
| `NetAmount`                                           | Decimal128              | Tiền cược thực (dùng tính WinLose ở bookkeeping)                                     |
| `PrizeNr?`                                            | number                  | Số giải còn lại tại thời điểm cược (Live)                                            |
| `ShareHolders`                                        | TicketItemShareHolder[] | `{UserId, ParentId, Level, Percent, ChildrenPercent, SellPrice, Income, Commission}` |
| `WinLose?, Result?, MultiPay?`                        |                         | Điền khi kết sổ (file 11)                                                            |
| `Owner?, Company?, Manager?, Super?, Master?, Agent?` | TicketItemShareHolder   | WinLose từng cấp sau kết sổ                                                          |

### B.3 `TicketCounterEntity` — collection `counters`

Bộ đếm sinh `TicketNr` tăng dần (findOneAndUpdate `$inc`), tránh trùng mã phiếu.

### B.4 `PlaceBettingTxEntity` — DynamoDB

Payload cược đầy đủ (numbers, prices, shareHolders, player info). `_id = TransactionId`, TTL `ExpiredAt = +7 ngày`, GSI `term_game_bet_ticketnr`, `term_game_bet`.

---

## C. CÔNG THỨC — Tiền Player phải trả

### C.1 Cược thường — `getPlayerPayAmount` (`place-betting-helper.ts:468`)

```468:509:server/src/services/lottery/services/game-play/infrastructure/services/place-betting/place-betting-helper.ts
    getPlayerPayAmount(param: {
        gameType: GameType;
        betType: BetType;
        ticketItemNewPrice: number;
        ticketItemPoint: number;
        ticketItemPayouts: number;
        parameterBetTimes: number;
        parameterMinItemPerTicket: number;
    }): number {
        switch (param.betType) {
            case BetType.DeTruot: {
                return (
                    param.ticketItemPoint *
                    (param.ticketItemNewPrice - param.ticketItemPayouts) *
                    (param.parameterBetTimes / param.parameterMinItemPerTicket)
                );
            }
            case BetType.LoTruot: {
                return (
                    param.ticketItemPoint *
                    (param.ticketItemNewPrice - param.ticketItemPayouts) *
                    param.parameterBetTimes
                );
            }
            default: {
                return (
                    param.ticketItemNewPrice *
                    param.ticketItemPoint *
                    param.parameterBetTimes
                );
            }
        }
    },
```

- **Thường**: `PayAmount = NewPrice × Point × BetTimes`.
- **Đề Trượt**: `Point × (NewPrice − Payouts) × (BetTimes / MinItemPerTicket)` (chỉ thu 1/số-con vì trượt là "không về mới ăn").
- **Lô Trượt**: `Point × (NewPrice − Payouts) × BetTimes`.

### C.2 Cược Live — `getPlayerPayAmountLive` (`place-betting-helper.ts:522`)

```typescript
let amount = ticketItemNewPrice * ticketItemPoint * parameterBetTimes; // MB1
if ([MienBac2, MienNam18A, MienNam18B, MienNam18C].includes(gameType)) {
    amount *= prizeNr; // MB2 & Miền Nam: nhân số giải còn lại
}
```

---

## D. CÔNG THỨC — Income & Commission mỗi cấp đại lý

### D.1 Cược thường — `getIncomeAndCommission` (`place-betting-helper.ts:130`)

Duyệt shareHolders **từ Level cao (Player/Agent) → thấp (Owner)**:

**Tài khoản Owner (không có cha):**

- `Income = SellPrice × (Percent/100) × Point × BetTimes`
- Đề Trượt: `Income = (SellPrice − Payouts) × (Percent/100) × Point × (BetTimes / MinItemPerTicket)`
- Lô Trượt: `Income = (SellPrice − Payouts) × (Percent/100) × Point × BetTimes`
- `Commission = 0`

**Tài khoản có cha:**

- `Income = ParentSellPrice × (Percent/100) × Point × BetTimes` (Trượt dùng `ParentSellPrice − Payouts` như trên)
- `Commission = (SellPrice − ParentSellPrice) × Point × ((100 − ChildrenPercent)/100) × BetTimes`
    - Đề Trượt: nhân thêm `(BetTimes / MinItemPerTicket)` thay cho `BetTimes`.

> **Bản chất telescoping**: hoa hồng của một cấp = chênh giá bán so với cha, nhân phần thầu mà cấp đó thực giữ (`100 − ChildrenPercent`).

### D.2 Cược Live — `getIncomeAndCommissionLive` (`place-betting-helper.ts:329`)

Như D.1 nhưng:

- Không có nhánh Trượt.
- Với **MB2 & Miền Nam**, nhân thêm số giải:
    ```
    factor = (prizeNr > AwardNumber) ? AwardNumber : prizeNr
    Income     *= factor
    Commission *= factor   (chỉ với tài khoản có cha)
    ```
    Lý do (comment trong code): "3D17 Lô chỉ có 17 giải nhưng player cược lúc còn 18 giải thì chỉ thu 17 lần tiền vì họ chỉ so sánh với 17 giải" → cap theo `AwardNumber`.

---

## E. CÔNG THỨC — % thầu thực & giá bán mỗi cấp — `getAncestorsShareHolderDetails` (`place-betting-helper.ts:569`)

Trả `ShareHolderDetail[]` (không gồm Player). Duyệt từ Player lên Owner:

- `basePrice` = `basePriceLiveMienBac1` (nếu Live MB1) hoặc `playerShareHolder.BasePrice`.
- `Price[cha] = basePrice + child.ExtraPrice + totalAncestorExtraPrice` (tổng ExtraPrice các cấp trên child).
- **Cha thầu cứng**: `Percent = round(ParentPercent_cha − Percent_child, 4)`; nếu có `remainPercent` dồn lên thì cộng vào rồi reset về 0.
- **Cha thầu mềm**: `Percent = child.ParentPercent`; `remainPercent += (ParentPercent_cha − child.ParentPercent − child.Percent)`.
- `ChildrenPercent = child.Percent + child.ChildrenPercent` (cộng dồn từ dưới lên).

---

## F. CÔNG THỨC — Điểm tối đa cược mỗi số — `getMaxPointCanBetPerNumber` (`place-betting-helper.ts:995`)

```995:1021:server/src/services/lottery/services/game-play/infrastructure/services/place-betting/place-betting-helper.ts
    getMaxPointCanBetPerNumber(param: {
        maxPointForNoShare: number;
        maxPointForMaxShare: number;
        playerMaxPointPerNumber: number;
        companyPercent: number;
    }): number {
        if (param.companyPercent === 0) {
            return Math.min(
                param.maxPointForMaxShare,
                param.playerMaxPointPerNumber,
            );
        }
        return Math.min(
            Math.min(
                _.ceil(param.maxPointForNoShare / (param.companyPercent / 100)),
                param.maxPointForMaxShare,
            ),
            param.playerMaxPointPerNumber,
        );
    },
```

- **Công ty thầu 0%**: `min(maxPointForMaxShare, playerMaxPointPerNumber)`.
- **Công ty thầu > 0%**: `min( ceil(maxPointForNoShare / (companyPercent/100)), maxPointForMaxShare, playerMaxPointPerNumber )`.

Ý nghĩa: công ty ôm càng ít (%thấp) → cho cược càng nhiều (chia `companyPercent`), nhưng chặn trần bởi `maxPointForMaxShare` và cấu hình hội viên.

---

## G. Validate bổ sung

- **`validateTotalShareHolderPercent`** (`:1030`): `round(Σ Percent, 4) === 100` — tổng % thầu các cấp phải đúng 100%.
- **`validateSellingPriceBetween2Level`** (`:1051`): giá bán của Agent (cha trực tiếp Player) phải `=== playerBuyPrice`; giá cấp con luôn `≥` giá cấp cha (sort Agent→Owner).

---

## H. Idempotency, rate-limit, rollback

- **Idempotency**: `createTX` DynamoDB với điều kiện `attribute_not_exists` theo `TransactionId` — trùng TX bị chặn ngay.
- **Rate limit**: Redis key `...:player_bet_rate_limit:user:{userId}` và `...:ip:{ip}`, TTL 5 giây. **Fail-open**: Redis lỗi → cho qua.
- **Rollback thủ công**: `save-ticket` fail → gọi `deposit` hoàn tiền đã trừ ở `withdraw-balance` (không dùng SAGA tự động).
- **Cache hot-path** (5 phút): shareHolder, userGameSetting, parameter theo `{userId}:{gt}:{bt}`.

---

## I. Cập nhật thống kê sau khi lưu phiếu (state `notify` + downstream)

Song song / bất đồng bộ:

- **single-number / multi-number**: tăng Point/Amount/Quantity theo user & các cấp (file 09).
- **outstanding report**: `$inc` incremental (file 13).
- **player-ip-bet**: ghi nhận IP (file 13).
- **realtime**: publish tới self + ancestor channel.

---

## J. API endpoints

**Player** (`pl-endpoint.yml`):

- `POST /player/place-betting` — body: `{ TransactionId, GameType, BetType, Items: [{Numbers[], Point}], ... }`; quyền Player + `WriteBetting`.
- `GET /player/tickets` — lịch sử phiếu.

**Agent**: xem phiếu của tuyến dưới, phục vụ đối soát.

---

## K. Gợi ý khi xây lại

1. **Tách payload lớn ra DynamoDB + chuyền object gọn qua state machine** là pattern bắt buộc nếu dùng Step Functions.
2. **Copy chính xác các công thức C/D/E/F** — đặc biệt nhánh Trượt (chia `MinItemPerTicket`) và nhánh Live (nhân `prizeNr` cap bởi `AwardNumber`).
3. **Idempotency theo TransactionId** ở tầng ghi (DynamoDB) là chốt chống double-bet mạnh nhất; rate-limit chỉ là lớp phụ.
4. **`ShareHolders` được đóng băng vào từng ticketItem** ngay lúc cược — bookkeeping dùng lại đúng cấu hình này (không đọc lại cấu hình hiện tại) → đảm bảo tính đúng dù cấu hình đổi sau.
