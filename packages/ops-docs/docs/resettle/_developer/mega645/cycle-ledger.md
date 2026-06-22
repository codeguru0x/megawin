# Cycle Ledger — Hướng dẫn DBA

## Mô tả

Collection `mega645_jackpot_cycle_entries` lưu lịch sử tích luỹ Jackpot theo từng kỳ quay. Mỗi document = 1 kỳ quay đã settle trong 1 jackpot cycle.

Mega 6/45 là **single jackpot** (trúng 6/6 số), KHÔNG có số thưởng (bonus), KHÔNG có JP2/overflow/split như Power 6/55. Ledger chỉ cần `openingJp`, `jpContribution`, `closingJp`, `hasJpWinner`.

## Schema

```js
{
  _id: ObjectId,
  cycleNo: Number,          // Số thứ tự jackpot cycle
  drawId: String,           // ID kỳ quay (business key) — format YYYY-MM-DD.NNN
  drawNo: Number,           // Số thứ tự kỳ trong ngày (1 cho Mega 6/45)
  seq: Number,              // Số thứ tự kỳ TRONG cycle (1-based)
  openingJp: Number,        // Giá trị JP đầu kỳ (VND) — TRƯỚC khi cộng contribution
  jpContribution: Number,   // Phần cộng JP từ kỳ này (VND); = 0 nếu có winner
  closingJp: Number,        // Giá trị JP cuối kỳ (VND) — SAU settle
  hasJpWinner: Boolean,     // Kỳ này có người trúng JP (6/6) không
  settledAt: Date,          // Thời điểm settle
  updatedAt: Date
}
```

## Index đề xuất

```js
db.mega645JackpotCycleEntries.createIndex({ cycleNo: 1, seq: 1 }, { unique: true })
db.mega645JackpotCycleEntries.createIndex({ drawId: 1 }, { unique: true })
```

## Invariant quan trọng

- `opening(T) === closing(T-1)` — tích luỹ tuần tự trong cycle.
- `cycleDrawCountBefore = seq - 1` — dùng khi resettle.
- Không có winner: `closingJp = openingJp + jpContribution`.
- Có winner: `hasJpWinner = true`, cycle ĐÓNG sau kỳ này → opening kỳ tiếp thuộc cycle MỚI (= `seedAmount`).
- Kỳ đầu cycle: `seq = 1`, `openingJp = seedAmount`.

## Queries thường dùng

### Xem toàn bộ lịch sử 1 cycle

```js
db.mega645JackpotCycleEntries.find(
  { cycleNo: <CYCLE_NO> },
  { sort: { seq: 1 } }
).toArray()
```

### Tìm ledger entry của 1 kỳ

```js
db.mega645JackpotCycleEntries.findOne({ drawId: "<DRAW_ID>" })
```

### Kiểm tra chain sau kỳ T

```js
const t = db.mega645JackpotCycleEntries.findOne({ drawId: "<DRAW_ID_T>" })
db.mega645JackpotCycleEntries.find(
  { cycleNo: t.cycleNo, seq: { $gt: t.seq } },
  { sort: { seq: 1 } }
).toArray()
```

### Verify tính liên tục của chain

```js
const entries = db.mega645JackpotCycleEntries.find(
  { cycleNo: <CYCLE_NO> },
  { sort: { seq: 1 } }
).toArray()

for (let i = 1; i < entries.length; i++) {
  const prev = entries[i - 1]
  const curr = entries[i]
  if (curr.openingJp !== prev.closingJp) {
    print(`INCONSISTENCY at seq ${curr.seq}: opening(${curr.openingJp}) !== closing of prev(${prev.closingJp})`)
  }
}
print("Chain verification done")
```

## Khi nào KHÔNG có ledger entry?

- Kỳ settle **trước khi** Cycle Ledger ra production (backfill KHÔNG được thực hiện).
- Nếu `findByDraw` trả `null`, hệ thống trả `LEDGER_MISSING` và yêu cầu DBA can thiệp.

Trong trường hợp này, DBA cần tìm `openingJp` từ nguồn khác (daily report, audit log, hay tính ngược từ activeCycle).

## Reset/Re-ghi ledger khi resettle TYPE_B2

Sau khi DBA thực hiện quy trình B2, xoá và để hệ thống ghi lại:

```js
// Xoá entries từ seq >= seq(T)
db.mega645JackpotCycleEntries.deleteMany({
  cycleNo: <CYCLE_NO>,
  seq: { $gte: <SEQ_OF_T> }
})
// FinalizeSettle sẽ upsert lại khi settle xong
```
