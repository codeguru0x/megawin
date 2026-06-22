# TYPE_B1 — Auto Payout + DBA Cycle

## Điều kiện

- Winner JP tại kỳ T **THAY ĐỔI** theo bất kỳ chiều nào (xem bảng "Winner JP thay đổi 2 chiều" trong [README](./README.md)):
  - **Case 1** — chưa có → **CÓ** winner (xuất hiện mới).
  - **Case 2** — **CÓ** winner → không còn (gỡ bỏ winner cũ).
  - **Case 3** — vẫn có winner (có thể khác số người/pool).
- Kỳ T là kỳ **đã kết sổ mới nhất** trong ledger — tức không có kỳ nào **đã kết sổ** sau T (theo `drawId`, xuyên cycle; chain rỗng, `chainLength = 0`).

> Mega 6/45 là **single jackpot**: chỉ có 1 giải JP (6/6 số). Mọi winner JP đều **đóng cycle** (không có "reset-only" như JP2 của Power 6/55).

> **Case 2 quan trọng — gỡ winner cũ cũng là TYPE_B1**: nếu kết quả cũ có JP winner thì cycle cũ đã **đóng** và một cycle mới đã mở. Khi sửa kết quả thành "không winner", cycle cũ đáng lẽ **không được đóng** → DBA phải **mở lại / khôi phục** cycle cũ thay vì đóng/tạo mới. Đây là chiều ngược của Trường hợp A.

> **Lưu ý**: điều kiện "chain rỗng" chỉ xét các kỳ **đã kết sổ** (có ledger entry). Trường hợp T đổi winner và phía sau còn nhiều kỳ **đang chạy chưa kết sổ** vẫn là TYPE_B1 — vì các kỳ đó chưa có ledger entry, chưa đọc jackpot pool từ T. Sau khi DBA cập nhật cycle, các kỳ đó sẽ tự đọc đúng cycle/pool mới khi đến lượt kết sổ.

## Nguyên tắc

Hệ thống tự động:
- Reversal payout cũ → reset entries → re-settle với kết quả mới.
- `FinalizeSettle` **BỎ QUA** bước `updateJackpotCycle` (`skipCycleUpdate=true`).

DBA can thiệp thủ công:
- Sau khi re-settle xong, DBA cập nhật `mega645_jackpot_cycles` để phản ánh đúng winner và cycle structure.

## Luồng

```mermaid
sequenceDiagram
    participant Staff
    participant BO_API as BO API
    participant ResetSFN as Resettle SFN
    participant SettleSFN as Settle SFN (nested)
    participant DBA
    participant DB as MongoDB

    Staff->>BO_API: POST /resettle-preflight
    BO_API-->>Staff: { scenario: "TYPE_B1", message: "Winner JP tại T thay đổi (mới/gỡ) — cần DBA update cycle" }

    Staff->>DBA: Thông báo: sắp có resettle TYPE_B1
    Staff->>BO_API: POST /publish-result (kết quả mới)
    Staff->>BO_API: POST /trigger-resettle
    BO_API->>ResetSFN: StartExecution { resettleContext.skipCycleUpdate=true }

    Note over ResetSFN,SettleSFN: Auto: reversal + reset + re-settle
    SettleSFN->>DB: FinalizeSettle: upsert ledger (skipCycleUpdate=true → KHÔNG update cycle)
    SettleSFN-->>Staff: ResettleSucceeded

    Note over DBA: DBA thực hiện sau khi settle xong
    DBA->>DB: Xem entries để biết JP winner accounts
    DBA->>DB: Cập nhật mega645_jackpot_cycles (đóng/mở cycle nếu có JP winner)
    DBA-->>Staff: Xác nhận cycle đã update
```

## Bước thực hiện

### Staff

1. Gọi `/resettle-preflight` xác nhận TYPE_B1.
2. Thông báo DBA để DBA chuẩn bị.
3. Gọi `/publish-result` với kết quả mới.
4. Gọi `/trigger-resettle`.
5. Theo dõi draw status → `settled`.
6. Báo DBA đã settle xong để DBA update cycle.

### DBA (sau khi settle xong)

#### Bước 1: Xác nhận settle đã hoàn tất

```js
// Kiểm tra draw đã settled
db.mega645Draws.findOne({ drawId: "<DRAW_ID>" }, { status: 1, settledAt: 1, "jackpot.closingJackpot": 1 })
```

#### Bước 2: Đọc ledger entry mới nhất của kỳ T

```js
db.mega645JackpotCycleEntries.findOne({ drawId: "<DRAW_ID>" })
// → { cycleNo, seq, openingJp, jpContribution, closingJp, hasJpWinner }
```

#### Bước 3: Đọc active cycle hiện tại

```js
db.mega645JackpotCycles.findOne({ status: "active" })
// → { cycleNo, currentAmount, drawCount, ... }
```

#### Bước 4: Cập nhật cycle

**Trường hợp A — Kết quả mới có JP winner (đóng cycle):**

```js
// Cycle cũ (đang active): close nó
db.mega645JackpotCycles.updateOne(
  { cycleNo: <CYCLE_NO> },
  {
    $set: {
      status: "closed",
      closedAt: new Date(),
      // hasJackpotWinner đã đúng từ FinalizeSettle
      updatedAt: new Date()
    }
  }
)

// Tạo cycle mới (next cycle)
// nextCycleNo = cycleNo + 1, currentAmount = seedAmount
db.mega645JackpotCycles.insertOne({
  cycleNo: <CYCLE_NO + 1>,
  status: "active",
  currentAmount: <seedAmount>,  // từ config
  seedAmount: <seedAmount>,     // từ config
  drawCount: 0,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

**Trường hợp C — Gỡ bỏ winner cũ (kết quả cũ CÓ winner → mới KHÔNG, case 2):**

Đây là chiều **ngược** với Trường hợp A. Cycle cũ đã bị đóng oan (và cycle mới đã mở oan) dựa trên winner cũ — cần khôi phục lại.

```js
// Bối cảnh: ledgerEntry kỳ T cũ có hasJpWinner=true → cycle <CYCLE_NO> đã bị đóng,
// cycle <CYCLE_NO + 1> đã được mở với seed. Giờ kết quả mới không còn winner.

// 1. Xoá / vô hiệu cycle mới đã mở oan (nếu chưa có kỳ nào khác settle vào nó).
db.mega645JackpotCycles.deleteOne({ cycleNo: <CYCLE_NO + 1>, drawCount: 0 })
// LƯU Ý: nếu drawCount > 0 (đã có kỳ khác settle vào cycle mới) → KHÔNG xoá được,
// tình huống này thực chất là TYPE_B2 (có chain sau T) — dừng lại, theo type-b2.md.

// 2. Mở lại cycle cũ: status active, khôi phục amount = closing kỳ T MỚI (sau re-settle).
db.mega645JackpotCycles.updateOne(
  { cycleNo: <CYCLE_NO> },
  {
    $set: {
      status: "active",
      // closingJp lấy từ ledger entry kỳ T MỚI (sau re-settle, không còn winner)
      currentAmount: <ledgerEntry.closingJp>,
      drawCount: <ledgerEntry.seq>,
      updatedAt: new Date()
    },
    $unset: { closedAt: "" }
  }
)
```

> **Cảnh báo**: nếu cycle mới (`<CYCLE_NO + 1>`) đã có kỳ khác settle vào (`drawCount > 0`), thì pre-flight đã phải phân loại thành **TYPE_B2** (chain sau T không rỗng), không phải B1. Nếu vẫn gặp `drawCount > 0` ở đây, **DỪNG LẠI** và xử lý theo [type-b2.md](./type-b2.md).

#### Bước 5: Xác nhận

```js
db.mega645JackpotCycles.findOne({ status: "active" })
// Kiểm tra currentAmount, drawCount đúng không
```

## Lưu ý quan trọng

- **KHÔNG** update cycle trước khi settle xong — `FinalizeSettle` đã upsert ledger với giá trị đúng, DBA chỉ cần update active cycle.
- Kiểm tra `ledgerEntry.closingJp` để biết chính xác số tiền JP cần reset.
- Nếu có nhiều JP winner trong cùng kỳ T, JP pool chia đều — cycle mới mở lại với `currentAmount = seedAmount`.
