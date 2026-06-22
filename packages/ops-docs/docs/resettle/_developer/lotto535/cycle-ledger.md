# Cycle Ledger — Hướng dẫn DBA (Lotto 5/35)

## Mô tả

Collection `lotto535_jackpot_cycle_entries` lưu lịch sử tích luỹ **single jackpot** theo từng kỳ quay. Mỗi document = 1 kỳ đã settle trong 1 jackpot cycle.

## Schema

```js
{
  _id: ObjectId,
  cycleNo: Number,              // Số thứ tự jackpot cycle
  drawId: String,               // ID kỳ quay (YYYY-MM-DD.NNN)
  drawNo: Number,               // 1 = sáng, 2 = tối
  seq: Number,                  // Thứ tự kỳ TRONG cycle (1-based)
  opening: Number,              // Jackpot đầu kỳ (VND) — trước contribution
  contribution: Number,         // Đóng góp jackpot từ kỳ này (VND)
  closing: Number,              // Jackpot cuối kỳ (VND) — sau settle
  hasJpWinner: Boolean,         // Có người trúng Jackpot (5 main + special)
  didSplit: Boolean,            // Kỳ này đã split jackpot xuống tier1–5
  isSplitCycleAtSettle: Boolean, // Snapshot flag split lúc settle
  settledAt: Date,
  updatedAt: Date
}
```

## Split Cycle

- Chỉ áp dụng **kỳ tối** (`drawNo === 2`) khi `opening >= splitThreshold` và **không** có winner JP.
- `didSplit` / `isSplitCycleAtSettle` dùng trong **detect-boundaries** — thay đổi split → TYPE_B1/B2.

## Index

```js
db.lotto535_jackpot_cycle_entries.createIndex({ cycleNo: 1, seq: 1 }, { unique: true })
db.lotto535_jackpot_cycle_entries.createIndex({ drawId: 1 }, { unique: true })
```

## Invariant

- `opening(T) === closing(T-1)` theo thời gian (`drawId`, xuyên cycle; cascade B2 đọc `closing(prev)` qua `findClosingBeforeDraw`, không tin `ledger(K).opening` bị `$setOnInsert` đóng băng).
- **Split phụ thuộc opening**: `split(K) = drawNo(K) === Evening && opening(K) >= splitThreshold && !hasJpWinner(K)`. Vì `opening(K) = closing(K-1)`, sửa kết quả kỳ trước làm đổi `closing` → đổi `opening` kỳ sau → **split có thể chuyển kỳ**. Đây là lý do resettle có chain (`chainLength > 0`) LUÔN là TYPE_B2 (cascade) — xem [README](./README.md) và [type-b2.md](./type-b2.md).
- Resettle B2: DBA chốt cycle sau mỗi kỳ; worker `skipCycleUpdate=true` khi re-settle, nhưng vẫn ghi đè `opening/closing/didSplit` ledger cho chuỗi liên tục.

## Resettle

- `FinalizeSettle` luôn `upsertEntry` (ghi ledger mới với `didSplit`, `isSplitCycleAtSettle`).
- `LEDGER_MISSING`: entry mất → dừng resettle, kiểm tra collection thủ công.
