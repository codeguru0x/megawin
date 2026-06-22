# Cycle Ledger — Hướng dẫn DBA

## Mô tả

Collection `power655_jackpot_cycle_entries` lưu lịch sử tích luỹ Jackpot theo từng kỳ quay. Mỗi document = 1 kỳ quay đã settle trong 1 jackpot cycle.

## Schema

```js
{
  _id: ObjectId,
  cycleNo: Number,          // Số thứ tự jackpot cycle
  drawId: String,           // ID kỳ quay (business key)
  drawNo: Number,           // Số thứ tự kỳ trong năm
  seq: Number,              // Số thứ tự kỳ TRONG cycle (1-based)
  openingJp1: Number,       // Giá trị JP1 đầu kỳ (VND) — TRƯỚC khi cộng contribution
  openingJp2: Number,       // Giá trị JP2 đầu kỳ (VND)
  jp1Contribution: Number,  // Phần cộng JP1 từ kỳ này (VND)
  jp2Contribution: Number,  // Phần cộng JP2 từ kỳ này (VND)
  jp1Overflow: Number,      // Overflow từ JP1 sang JP2 (khi pool JP1 vượt cap)
  closingJp1: Number,       // Giá trị JP1 cuối kỳ (VND) — SAU settle
  closingJp2: Number,       // Giá trị JP2 cuối kỳ (VND)
  hasJp1Winner: Boolean,    // Kỳ này có người trúng JP1 không
  hasJp2Winner: Boolean,    // Kỳ này có người trúng JP2 không
  jp2DidReset: Boolean,     // JP2 đã reset trong kỳ này (= hasJp2Winner)
  settledAt: Date,          // Thời điểm settle
  updatedAt: Date
}
```

## Index đề xuất

```js
db.power655JackpotCycleEntries.createIndex({ cycleNo: 1, seq: 1 }, { unique: true })
db.power655JackpotCycleEntries.createIndex({ drawId: 1 }, { unique: true })
```

## Invariant quan trọng

- `opening(T) === closing(T-1)` — tích luỹ tuần tự trong cycle.
- `cycleDrawCountBefore = seq - 1` — dùng khi resettle.
- `closingJp1 = openingJp1 + jp1Contribution - jp1Overflow - winAmount` (0 nếu không có winner).

## Queries thường dùng

### Xem toàn bộ lịch sử 1 cycle

```js
db.power655JackpotCycleEntries.find(
  { cycleNo: <CYCLE_NO> },
  { sort: { seq: 1 } }
).toArray()
```

### Tìm ledger entry của 1 kỳ

```js
db.power655JackpotCycleEntries.findOne({ drawId: "<DRAW_ID>" })
```

### Kiểm tra chain sau kỳ T

```js
const t = db.power655JackpotCycleEntries.findOne({ drawId: "<DRAW_ID_T>" })
db.power655JackpotCycleEntries.find(
  { cycleNo: t.cycleNo, seq: { $gt: t.seq } },
  { sort: { seq: 1 } }
).toArray()
```

### Verify tính liên tục của chain

```js
const entries = db.power655JackpotCycleEntries.find(
  { cycleNo: <CYCLE_NO> },
  { sort: { seq: 1 } }
).toArray()

for (let i = 1; i < entries.length; i++) {
  const prev = entries[i - 1]
  const curr = entries[i]
  if (curr.openingJp1 !== prev.closingJp1 || curr.openingJp2 !== prev.closingJp2) {
    print(`INCONSISTENCY at seq ${curr.seq}: opening(${curr.openingJp1}, ${curr.openingJp2}) !== closing of prev(${prev.closingJp1}, ${prev.closingJp2})`)
  }
}
print("Chain verification done")
```

## Khi nào KHÔNG có ledger entry?

- Kỳ settle **trước khi** Cycle Ledger ra production (backfill KHÔNG được thực hiện).
- Nếu `findByDraw` trả `null`, hệ thống trả `LEDGER_MISSING` và yêu cầu DBA can thiệp.

Trong trường hợp này, DBA cần tìm openingJp1/2 từ nguồn khác (daily report, audit log, hay tính ngược từ activeCycle).

## Reset/Re-ghi ledger khi resettle TYPE_B2

Sau khi DBA thực hiện quy trình B2, xoá và để hệ thống ghi lại:

```js
// Xoá entries từ seq >= seq(T)
db.power655JackpotCycleEntries.deleteMany({
  cycleNo: <CYCLE_NO>,
  seq: { $gte: <SEQ_OF_T> }
})
// FinalizeSettle sẽ upsert lại khi settle xong
```
