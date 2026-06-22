# Troubleshooting — Resettle Mega 6/45

## Draw kẹt ở status "settling"

### Nguyên nhân thường gặp

1. **Lambda timeout**: Step Function vẫn đang chạy nhưng timeout của 1 step.
2. **MongoDB connection error**: Timeout khi ghi DB trong step đang chạy.
3. **SFN execution failed**: Lỗi trong 1 step không bắt được.

### Chẩn đoán

```js
// Kiểm tra draw status và settledAt
db.mega645Draws.findOne({ drawId: "<DRAW_ID>" }, { status: 1, settledAt: 1, updatedAt: 1 })
```

Vào **AWS Step Functions Console** → tìm execution có tên `<drawId>-resettle-<settledAtMs>` → xem chi tiết trạng thái từng step.

### Xử lý

Nếu SFN execution **đang chạy** (RUNNING): đợi nó hoàn tất (tối đa 15-20 phút với Mega 6/45 pipeline).

Nếu SFN execution **đã FAILED**:
1. Xác định step nào fail.
2. Xem lý do trong CloudWatch Logs.
3. Fix nguyên nhân (thường là transient DB error).
4. Trigger lại từ BO API: `POST /trigger-resettle` (idempotent).

---

## Lỗi "LEDGER_MISSING" khi trigger resettle

Kỳ T đã `settled` nhưng không tìm thấy ledger entry trong `mega645_jackpot_cycle_entries`.

> **Không xảy ra trong vận hành bình thường.** Ledger writer (`FinalizeSettle`) ghi entry cho mọi kỳ settle kể từ go-live, nên kỳ đã settled luôn có entry. Lỗi này = **bất thường data integrity**: entry bị xoá nhầm, migration lỗi, hoặc ghi sai `cycleNo/drawId`.

### Xử lý

1. **Dừng resettle** — KHÔNG tự tái tính thủ công (rủi ro tính sai opening/pool).
2. Báo **đội kỹ thuật** kiểm tra:
   - `db.mega645_jackpot_cycle_entries.findOne({ drawId: "<T>" })` → xác nhận entry thật sự mất.
   - Kiểm tra log `FinalizeSettle` của kỳ T xem `upsertEntry` có chạy không.
   - Nếu xác định được nguyên nhân và có đủ dữ liệu (opening/closing/winner flag) → khôi phục entry đúng rồi mới resettle lại.
3. Guard này phòng vệ chống crash (đọc `ledgerEntry.seq`/opening trên `null`), không phải quy trình DBA vận hành.

---

## Lỗi "RESETTLE_REQUIRES_DBA" (TYPE_B1 / TYPE_B2)

Hệ thống phát hiện kết quả mới làm thay đổi winner Jackpot (B1) hoặc ảnh hưởng chuỗi kỳ đã kết sổ (B2) → cần Quản trị hệ thống chốt jackpot cycle thủ công.

### Xử lý

Trigger lại với body `{ "dbaConfirmed": true }` sau khi đã phối hợp Quản trị hệ thống. Worker vẫn tự hoàn tiền + kết sổ lại; Quản trị hệ thống chỉ chốt cycle (B1: 1 kỳ; B2: từng kỳ cascade). Xem [type-b1.md](./type-b1.md) / [type-b2.md](./type-b2.md).

---

## Lỗi "RESETTLE_CASCADE_ORDER" (TYPE_B2)

Cố resettle một kỳ trong chain B2 khi kỳ TRƯỚC nó (theo thời gian, **xuyên cycle**) chưa hoàn tất resettle.

### Xử lý

Cascade phải chạy TUẦN TỰ theo `drawId` tăng dần (`chainDrawIds` từ pre-flight). Hoàn tất kỳ trước — gồm bước Quản trị hệ thống chốt/tái cấu trúc cycle để kỳ đó về `settled` — rồi mới resettle kỳ này. Opening kỳ sau = closing kỳ trước (theo thời gian), nên sai thứ tự sẽ tính sai payout.

---

## Cross-cycle (TYPE_B2) — gỡ JP winner ở kỳ T

Kỳ T cũ có **JP winner** (đã đóng cycle), nhưng kết quả mới **gỡ bỏ JP winner**, TRONG KHI cycle kế đã có ≥1 kỳ kết sổ.

> Mega 6/45 chỉ đóng cycle khi có JP winner. Gỡ JP winner làm cycle T đáng lẽ **không đóng** → các kỳ đã kết sổ ở cycle kế phải **gộp ngược** vào cycle T. Trước đây bị CHẶN (`RESETTLE_CYCLE_RESTRUCTURE`); **nay đã bỏ chặn** — chain phát hiện theo `drawId` nên các kỳ này nằm trong chain B2 → resettle tuần tự, DBA chỉ tái cấu trúc cycle metadata giữa mỗi bước.

### Chẩn đoán

```js
// Ledger entry kỳ T — xác nhận cũ có JP winner (đóng cycle)
db.mega645JackpotCycleEntries.findOne({ drawId: "<T>" }, { cycleNo: 1, seq: 1, hasJpWinner: 1 })

// Các kỳ kết sổ SAU T theo thời gian (xuyên cycle) — chính là chain B2
db.mega645JackpotCycleEntries.find({ drawId: { $gt: "<T>" } }, { drawId: 1, cycleNo: 1, seq: 1 }).sort({ drawId: 1 })
```

### Xử lý

1. Resettle **tuần tự** từng kỳ trong `chainDrawIds` (`T → T+1 → … → T+n`), mỗi kỳ `{ "dbaConfirmed": true }`.
2. **Giữa mỗi bước**, DBA tái cấu trúc cycle metadata dựa trên ledger: gộp cycle kế ngược vào cycle T (đổi `cycleNo`/`seq`, reopen cycle T). Worker tự re-settle entries + payout (`skipCycleUpdate=true`); DBA **không** re-settle thủ công.
3. Sau mỗi kỳ, đối chiếu chain ledger (xem mục "Kiểm tra chain ledger sau resettle") trước khi sang kỳ kế tiếp.

---

## Reversal bị enqueue 2 lần (double-debit)

Nếu player bị debit 2 lần cho cùng payout cũ.

### Nguyên nhân

Thường do `clearReversalSnapshot` không được gọi trước phiên resettle mới, hoặc `EnqueueReversals` bị chạy lại ngoài scope SFN.

### Kiểm tra

```js
// Tìm orders có cùng entryId
db.tenantDispatchOrders.find({
  "metadata.entryId": "<ENTRY_ID>",
  action: "debit",
  "metadata.resettleId": { $exists: true }
})
```

Nếu có 2 orders với `resettleId` khác nhau → duplicate.

### Xử lý

1. Cancel dispatch order thứ 2 (nếu chưa dispatch).
2. Nếu đã dispatch, phối hợp với tenant để hoàn tiền thủ công cho player.

---

## Entries vẫn ở status "scheduled" sau resettle

Một số entries không được settle lại.

### Nguyên nhân

`SettleEntries` step không chạy hết (cursor pagination còn dở, SFN timeout).

### Chẩn đoán

```js
db.mega645TicketEntries.countDocuments({ drawId: "<DRAW_ID>", status: "scheduled" })
```

### Xử lý

Trigger lại từ BO API (`/trigger-resettle`): `PrepareResettle` sẽ skip entries đã ở `Scheduled` (không snapshot reversal lại), `SettleEntries` sẽ tiếp tục settle.

---

## Jackpot cycle sai sau TYPE_B1

`FinalizeSettle` đã chạy với `skipCycleUpdate=true` nên cycle không được update. DBA cần update thủ công.

Xem [type-b1.md](./type-b1.md#dba-sau-khi-settle-xong) để biết câu lệnh cụ thể.

---

## Kiểm tra chain ledger sau resettle

```js
const entries = db.mega645JackpotCycleEntries.find(
  { cycleNo: <CYCLE_NO> },
  { sort: { seq: 1 } }
).toArray()

let errors = []
for (let i = 1; i < entries.length; i++) {
  const prev = entries[i-1], curr = entries[i]
  if (curr.openingJp !== prev.closingJp) {
    errors.push(`seq ${curr.seq}: openingJp mismatch`)
  }
}

if (errors.length === 0) print("Chain OK")
else errors.forEach(e => print("[ERROR]", e))
```
