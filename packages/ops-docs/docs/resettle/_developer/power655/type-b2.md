# TYPE_B2 — Cascade Step-wise (Auto Payout + DBA Cycle từng kỳ)

## Điều kiện

Một trong hai:
1. Winner JP tại kỳ T **THAY ĐỔI** theo bất kỳ chiều nào (xuất hiện mới / gỡ bỏ / vẫn còn — xem bảng 2 chiều trong [README](./README.md)) **VÀ** có chain kỳ **đã kết sổ** sau T (theo `drawId`, **xuyên cycle**, `chainLength > 0`).
2. Chain **đã kết sổ** sau T **có** ai trúng JP (bất kể winner tại T có đổi hay không).

Khác TYPE_B1 ở chỗ: B1 chain rỗng (T là kỳ mới nhất, chỉ 1 kỳ cần xử lý). B2 có **chuỗi kỳ đã kết sổ sau T** — sửa kết quả T làm đổi pool tích luỹ của mọi kỳ phía sau.

## Tại sao KHÔNG cần full-DBA tính tay?

Insight quan trọng: **sửa kết quả chỉ ở kỳ T**. Các kỳ T+1, T+2, … **không đổi số quay** → **danh tính người trúng không đổi**, chỉ **số tiền nhận thay đổi** (do JP pool tích luỹ khác đi).

Mà tính lại số tiền cho từng kỳ chính là việc `Settle` đã làm tự động — miễn là `openingJp1/2` của mỗi kỳ đúng. Cycle Ledger lưu `closing` từng kỳ, và hệ thống áp **bất biến `opening(K) = closing(K-1)`**: khi resettle kỳ K, `trigger-resettle` đọc `closingJp1/2` của kỳ K-1 (vừa resettle xong) làm opening của K, rồi `FinalizeSettle` ghi đè lại `opening` trong ledger(K) cho liên tục. Vì vậy ta **cascade tuần tự**:

- Worker lo **payout + kết sổ lại** cho TỪNG kỳ (giống hệt luồng B1, `skipCycleUpdate=true`), tự lấy opening đúng từ closing kỳ trước.
- DBA chỉ **chốt jackpot cycle** (`power655JackpotCycles`) sau mỗi kỳ — checkpoint cho cycle structure (đóng/mở cycle khi có/gỡ JP1 winner). DBA **không** phải sửa `openingJp1/2` trong ledger — hệ thống tự lo.

→ DBA **không** debit/credit thủ công, **không** tính payout tay. Khối lượng việc của DBA giảm còn đúng phần cycle.

> **`LEDGER_MISSING` không phải scenario vận hành.** Ledger writer ghi entry cho mọi kỳ settle từ go-live → kỳ đã settled luôn có entry. Nếu gặp `LEDGER_MISSING` nghĩa là **bất thường data integrity** (entry bị mất/xoá) → dừng, báo đội kỹ thuật. Xem mục cuối tài liệu này.

## Nguyên tắc cascade

Resettle tuần tự theo `drawId` tăng dần: `T → T+1 → … → T+n`. Với MỖI kỳ:

1. **Worker (auto)**: reversal payout cũ → reset entries → re-settle với pool đúng (opening kỳ K = closing kỳ K-1, hệ thống tự đọc từ ledger) → upsert ledger (`skipCycleUpdate=true` → KHÔNG tự update cycle; nhưng GHI ĐÈ `opening/closing` ledger(K) cho chuỗi liên tục).
2. **DBA (checkpoint)**: cập nhật `power655JackpotCycles` phản ánh đúng winner/pool kỳ vừa rồi (đóng/mở cycle khi JP1 winner thay đổi). KHÔNG cần sửa `openingJp1/2` trong ledger — worker đã tự ghi đúng.
3. Sang kỳ tiếp theo. **Guard backend** (`RESETTLE_CASCADE_ORDER`) chặn nếu cố resettle kỳ sau khi kỳ trước chưa hoàn tất.

Vì opening kỳ K đọc trực tiếp từ `ledger(K-1).closing` (worker tự resolve trong `trigger-resettle`), miễn cascade chạy đúng thứ tự thì mọi payout đều đúng — không phụ thuộc DBA sửa ledger tay.

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
    BO_API-->>Staff: { scenario: "TYPE_B2", chainDrawIds: [T, T+1, …, T+n] }

    Note over Staff,DBA: Cascade từng kỳ theo thứ tự chainDrawIds
    loop Mỗi kỳ K trong [T, T+1, …, T+n]
        Staff->>BO_API: POST /publish-result(K) — chỉ kỳ T cần (kỳ sau giữ nguyên số)
        Staff->>BO_API: POST /trigger-resettle(K) { dbaConfirmed: true }
        BO_API->>BO_API: Guard RESETTLE_CASCADE_ORDER (kỳ trước phải Settled)
        BO_API->>ResetSFN: StartExecution { resettleContext.skipCycleUpdate=true }
        Note over ResetSFN,SettleSFN: Auto: reversal + reset + re-settle (opening đọc từ ledger)
        SettleSFN->>DB: upsert ledger(K) (skipCycleUpdate=true → KHÔNG update cycle)
        SettleSFN-->>Staff: ResettleSucceeded(K)
        Staff->>DBA: Báo kỳ K đã settle xong
    DBA->>DB: Chốt power655JackpotCycles theo winner/pool kỳ K (cycle structure)
    Note over DBA,DB: opening(K+1) hệ thống tự đọc từ ledger(K).closing — DBA không sửa ledger
    DBA-->>Staff: OK — sang kỳ kế tiếp
    end
    Staff->>BO_API: Verify toàn chain
```

## Bước thực hiện

### Trước khi bắt đầu (DBA)

1. **Backup MongoDB**: `power655Draws`, `power655TicketEntries`, `power655JackpotCycles`, `power655JackpotCycleEntries`.
2. **Lấy thứ tự cascade** từ `/resettle-preflight` → field `chainDrawIds` (đã sort theo `drawId` ASC, gồm cả T).
3. **Tránh settle kỳ MỚI** trong lúc đang cascade (đợi cascade xong rồi mở bán kỳ mới).

### Vòng lặp cascade — lặp cho từng kỳ K theo `chainDrawIds`

#### Bước A — Resettle kỳ K (Staff)

- **Kỳ T (kỳ đầu)**: đã `/publish-result` với kết quả mới (số quay sửa). Gọi `/trigger-resettle` với `dbaConfirmed: true`.
- **Kỳ T+1…T+n**: số quay KHÔNG đổi → **không** cần `/publish-result`. Nhưng để hệ thống cho phép re-settle, kỳ phải ở trạng thái resettle-able.

**Cách 1 (khuyến nghị) — UI / endpoint `resettle-reopen`:**

Trên màn hình Vận hành, kỳ T+n (đã settled, số không đổi) hiện mục **"Mở để kết sổ lại"** trong menu ⋮ (góc phải trên khung kỳ). Chọn mục này → gọi:

```
POST /api/power655/draws/<DRAW_ID_K>/resettle-reopen
Body: { "dbaConfirmed": true }
```

`ReopenForCascadeUseCase` re-stamp `result.publishedAt = now` (GIỮ NGUYÊN `winningMain` + `bonusNumber`), chuyển `settled → published`, `$unset financial/stats/settleSummary` — y hệt Cách 2 nhưng idempotent + có guard (`DRAW_NEVER_SETTLED`, `DRAW_INVALID_TRANSITION`, `RESETTLE_REQUIRES_DBA`). Sau khi mở, bấm **"Kết sổ lại"**.

**Cách 2 (fallback thủ công) — sửa trực tiếp DB** nếu endpoint không khả dụng:

```js
// Chỉ áp dụng cho kỳ chain (T+1…), result KHÔNG đổi — chỉ để mở luồng resettle.
// GIỮ NGUYÊN settledAt (high-water mark): trigger-resettle cần settledAt để
// (1) qua guard DRAW_NEVER_SETTLED, (2) build resettle token, (3) check
// publishedAt > settledAt. Chỉ set result.publishedAt mới hơn settledAt là đủ.
db.power655Draws.updateOne(
  { drawId: "<DRAW_ID_K>", status: "settled" },
  {
    $set: {
      status: "published",
      "result.publishedAt": new Date(), // > settledAt để qua check DRAW_NO_NEW_RESULT
      updatedAt: new Date()
    }
    // KHÔNG $unset settledAt — giữ làm high-water mark.
  }
)
```

> **Lưu ý**: chỉ set `result.publishedAt = new Date()` (mới hơn `settledAt` cũ) là đủ để `publishedAt > settledAt` → `trigger-resettle` không reject `DRAW_NO_NEW_RESULT`. **KHÔNG** được `$unset settledAt`: nếu xoá, `trigger-resettle` sẽ reject `DRAW_NEVER_SETTLED` (guard `if (!draw.settledAt)`) và mất resettle token. Sau khi re-settle xong, `settledAt` được `FinalizeSettle` ghi đè giá trị mới.

Sau đó:

```
POST /api/power655/draws/<DRAW_ID_K>/trigger-resettle
Body: { "dbaConfirmed": true }
```

Hệ thống tự: reversal payout cũ → reset entries → re-settle. `openingJp1/2` của kỳ K được `trigger-resettle` resolve = `closingJp1/2` của kỳ K-1 trong ledger (kỳ trước vừa resettle xong). `FinalizeSettle` upsert lại `ledger(K)` với opening (ghi đè) + closing mới, **không** đụng cycle.

#### Bước B — DBA chốt cycle cho kỳ K

Sau khi kỳ K `settled`. **Chỉ cập nhật `power655JackpotCycles`** (cycle structure) — KHÔNG đụng `power655JackpotCycleEntries` (worker đã ghi đúng opening/closing ledger).

```js
// 1. Đọc ledger entry mới của kỳ K (chỉ để THAM CHIẾU số liệu, không sửa)
const ledgerK = db.power655JackpotCycleEntries.findOne({ drawId: "<DRAW_ID_K>" })
// → { cycleNo, seq, openingJp1, openingJp2, closingJp1, closingJp2, hasJp1Winner, hasJp2Winner, jp2DidReset }

// 2. Cập nhật active cycle (power655JackpotCycles) theo winner/pool kỳ K —
//    quy tắc GIỐNG type-b1.md Bước 4:
//    - Có JP1 winner  → đóng cycle hiện tại, mở cycle mới (seed).
//    - Chỉ JP2 winner → reset jackpot2CurrentAmount về seed, JP1 giữ closingJp1.
//    - Gỡ winner cũ   → khôi phục cycle (chiều ngược), xem type-b1.md Trường hợp C.
//    - Không winner   → jackpot{1,2}CurrentAmount = closingJp{1,2}, drawCount = seq.
```

Chi tiết các trường hợp đóng/mở cycle: dùng nguyên **type-b1.md → Bước 4 (A/B/C)**. B2 chỉ khác là lặp lại cho từng kỳ.

> **Không cần sửa ledger opening**: opening kỳ K+1 sẽ do `trigger-resettle` tự đọc từ `ledger(K).closingJp1/2` khi resettle kỳ K+1. DBA chỉ lo `power655JackpotCycles`.

#### Bước C — Verify liên tục trước khi sang kỳ sau

```js
// Verify chuỗi opening/closing ledger liên tục tới kỳ K (worker đã tự ghi).
// Đây là bước KIỂM TRA an toàn, không phải DBA tự sửa.
db.power655JackpotCycleEntries.find(
  { cycleNo: ledgerK.cycleNo },
  { sort: { seq: 1 } }
).toArray()
// Đảm bảo chuỗi opening/closing liên tục tới kỳ K.
```

Xác nhận xong → báo Staff sang kỳ K+1. Guard `RESETTLE_CASCADE_ORDER` sẽ chặn nếu kỳ K chưa `settled`.

### Sau khi cascade xong

```js
// Toàn bộ chain liên tục, cycle active đúng amount cuối cùng
db.power655JackpotCycles.findOne({ status: "active" })
db.power655JackpotCycleEntries.find(
  { cycleNo: <CYCLE_NO> }, { sort: { seq: 1 } }
).toArray()
// Verify opening(T+1)===closing(T), opening(T+2)===closing(T+1), …
```

Mở bán kỳ mới trở lại. Notify staff verify trên UI.

## Guard thứ tự (backend)

`trigger-resettle` chặn cascade sai thứ tự: nếu còn kỳ TRƯỚC K (theo `drawId`, xuyên cycle) đang dở (đã republish nhưng chưa re-settle xong, `status != settled`) → throw `RESETTLE_CASCADE_ORDER`. Bắt buộc hoàn tất kỳ trước (gồm DBA chốt/tái cấu trúc cycle) rồi mới sang kỳ này → opening luôn đúng.

## Lưu ý quan trọng

- **KHÔNG** bỏ qua bước DBA chốt cycle (`power655JackpotCycles`) giữa các kỳ — cycle structure (đóng/mở khi JP1 winner thay đổi) cần đúng để báo cáo/jackpot hiển thị chính xác.
- Opening kỳ sau do **hệ thống tự resolve** từ `ledger(kỳ trước).closing` — DBA KHÔNG cần sửa `openingJp1/2` trong `power655JackpotCycleEntries`. Worker ghi đè opening/closing ledger mỗi kỳ.
- Worker **không tự update cycle** trong suốt cascade (`skipCycleUpdate=true` cho mọi kỳ B2). Cycle structure do DBA chốt tay từng bước.
- Số quay các kỳ T+1… **không đổi** — không `/publish-result` lại số mới cho chúng, chỉ mở trạng thái resettle.
- Cascade phải đúng thứ tự `seq` tăng dần (guard `RESETTLE_CASCADE_ORDER`) — sai thứ tự → opening lấy từ closing kỳ trước CHƯA resettle → payout sai.
- Backup TRƯỚC khi bắt đầu cascade.

## `LEDGER_MISSING` — guard data integrity (không phải quy trình vận hành)

Nếu kỳ T (hoặc kỳ trong chain) **không có ledger entry** (`findByDraw` trả null) dù đã `settled`, hệ thống reject `LEDGER_MISSING`.

**Tình huống này KHÔNG xảy ra trong vận hành bình thường**: ledger writer (`FinalizeSettle.upsertEntry`) ghi entry cho mọi kỳ settle kể từ go-live. Entry null ⟹ bất thường data integrity (bị xoá nhầm, migration lỗi, ghi sai `cycleNo/drawId`).

Xử lý: **dừng resettle, không tự tái tính**. Báo đội kỹ thuật kiểm tra `power655_jackpot_cycle_entries` + log `FinalizeSettle` của kỳ T. Chỉ resettle lại sau khi entry đã được khôi phục đúng. Guard này chủ yếu phòng crash (đọc `seq`/opening trên `null`). Xem [troubleshooting.md](./troubleshooting.md).
