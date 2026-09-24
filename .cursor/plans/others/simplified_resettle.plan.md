# Simplified Resettle Plan — "Chỉ resettle kỳ vừa settle xong"

> Plan này thay thế `unified_resettle.plan.md` khi áp dụng ràng buộc
> nghiệp vụ quan trọng:
>
> **RÀNG BUỘC VÀNG**: *"Kỳ bị resettle luôn là kỳ settled gần nhất.
> Không có kỳ nào settled sau nó trong cùng game."*
>
> Với ràng buộc này, bài toán "cascade reconstruct cycle chain" biến
> mất. Resettle = **undo đúng 1 bước mutation cuối cùng trên cycle**.

---

## 0. Tại sao ràng buộc này đơn giản hoá bài toán

Nhắc lại 5 vấn đề của unified plan (R-JP-1 → R-JP-5):

| Vấn đề | Ràng buộc vàng giải quyết thế nào |
|--------|----------------------------------|
| R-JP-1 Cycle đóng sai | ✅ Chỉ 1 mutation cuối cần undo (close HOẶC updateStats HOẶC create new) |
| R-JP-2 Cascade chain nhiều kỳ | ✅ Biến mất hoàn toàn — không có draw nào sau anchor |
| R-JP-3 Draw kế tiếp đọc sai JP opening | ✅ Biến mất — chưa có draw sau đã settle |
| R-JP-4 Reversal dispatch tiền lớn | ⚠️ Vẫn còn, nhưng dễ xử lý vì phạm vi nhỏ |
| R-JP-5 Seed config thay đổi | ✅ Biến mất — không cần tạo lại cycle mới giữa chừng |

Chỉ còn **R-JP-4** (dispatch tiền lớn) — đã được plan Keno xử lý.

---

## 1. "Undo mutation" là gì?

Mỗi lần settle 1 kỳ với game Jackpot, `FinalizeSettle` thực hiện
**đúng 1 trong 3 mutation** lên `jackpot_cycles`:

| Case | Mutation |
|------|----------|
| **Rollover** (không winner, không split) | `updateCycleStats(cycleNo, stats mới)` trên active cycle |
| **Winner hoặc Split** (đóng cycle) | 2 bước: `closeCycle(cycleNo, endDrawId)` + `createCycle(startDrawId=nextDraw)` |

Thêm vào đó, mutation lên `draw` doc:
- `draw.status: settling → settled`
- `$set draw.jackpot = snapshot` (opening/closing/isSplitCycle)
- `$set draw.financial, draw.stats, draw.settleSummary`

**Undo nghĩa là đảo ngược đúng những mutation này** — không hơn.

---

## 2. Kỹ thuật: "Snapshot-and-Restore" cycle

Ý tưởng đơn giản nhất:

> Trước khi `FinalizeSettle` mutate cycle, **snapshot cycle hiện tại
> vào chính `draw doc`**. Khi resettle, đọc snapshot đó và **khôi phục
> cycle y hệt** về trạng thái trước settle lần đầu.

### 2.1. Snapshot schema (thêm vào `DrawJackpotSnapshot`)

```ts
export interface DrawJackpotSnapshot {
  /** (đã có) Jackpot đầu kỳ. */
  openingAmount: number;
  /** (đã có) Jackpot cuối kỳ. */
  closingAmount: number;
  /** (đã có) Kỳ chia giải. */
  isSplitCycle?: boolean;

  /**
   * (MỚI) Snapshot trạng thái cycle NGAY TRƯỚC FinalizeSettle.
   * Đọc lúc PrepareSettle, ghi lúc FinalizeSettle (trước khi mutate cycle).
   * Resettle dùng để restore.
   */
  preSettleCycleSnapshot: CyclePreSettleSnapshot;
}

export interface CyclePreSettleSnapshot {
  /** Cycle đã active tại thời điểm settle. */
  activeCycleNo: number;
  /** currentAmount của cycle TRƯỚC khi settle. */
  currentAmount: number;
  /** totalContribution của cycle TRƯỚC khi settle. */
  totalContribution: number;
  /** drawCount của cycle TRƯỚC khi settle. */
  drawCount: number;
  /** peakAmount TRƯỚC settle — để restore lúc rollback. */
  peakAmount: number;
  /** lastSettledDrawId TRƯỚC settle (có thể undefined). */
  lastSettledDrawId?: string;
  /**
   * Nếu lần settle này đóng cycle → cycleNo của cycle được tạo ra
   * sau khi đóng (next cycle). Resettle cần delete nó khi undo.
   */
  createdNextCycleNo?: number;
  /**
   * Loại mutation lần trước — quyết định undo strategy.
   */
  mutationType: "rollover" | "winner" | "split";
}
```

### 2.2. Lúc nào snapshot được ghi

`PrepareSettle` đã load `activeCycle` (`jackpotOpeningAmount`, stats).
Chỉ cần **serialize toàn bộ stats cycle vào `SettleContext`** rồi
`FinalizeSettle` ghi vào `draw.jackpot.preSettleCycleSnapshot` **atomic
cùng lúc với `settleComplete`**.

```ts
// FinalizeSettle — sửa settleComplete signature để nhận snapshot
await this.drawRepo.settleComplete(drawId, {
  openingAmount: jackpotOpeningAmount,
  closingAmount,
  isSplitCycle: isSplitCycle || undefined,
  preSettleCycleSnapshot: {
    activeCycleNo: input.config.cycleNo,
    currentAmount: input.jackpotOpeningAmount,  // = cycle.currentAmount trước settle
    totalContribution: input.config.cycleContributionBefore,
    drawCount: input.config.cycleDrawCountBefore,
    peakAmount: ???,  // cần thêm vào config snapshot
    lastSettledDrawId: ???,
    createdNextCycleNo: undefined,  // sẽ update sau khi tạo cycle mới
    mutationType: hasJackpotWinner ? "winner"
                : splitExecuted ? "split"
                : "rollover",
  },
});

// Sau đó updateJackpotCycle như cũ; nếu tạo cycle mới, update lại
// preSettleCycleSnapshot.createdNextCycleNo.
```

Idempotent nhờ `settleComplete` filter `status: settling`.

---

## 3. Quy trình resettle đơn giản hoá

### 3.1. Flow tổng thể (cho mọi game nhóm B)

```
Input: drawId (kỳ vừa settled xong)

BO BƯỚC 1: POST /republish-result
  - Validate: draw.status === Settled
  - Validate: KHÔNG có draw nào status != Scheduled/SalesOpen
    (tức chưa có kỳ sau settled) — check trong drawRepo
  - drawRepo.republishResultAfterSettled(drawId, newResult):
    - $set status=Published, result=newResult
    - $unset financial, stats, settleSummary, settledAt, jackpot
    - KHÔNG đụng cycle (cycle sẽ được restore ở Resettle SFN)

BO BƯỚC 2: POST /resettle
  - StartExecution Resettle SFN

Resettle SFN (4 state — BẰNG SỐ STATE với Keno!):
  1. PrepareResettle
  2. EnqueueReversals (loop)
  3. RestoreCycle  ← MỚI (thay vì ReconstructCycle phức tạp)
  4. StartSettleExecution (nested Settle SFN)

  Chú ý: RestoreCycle chạy TRƯỚC Settle SFN — khôi phục cycle về
  trạng thái pre-settle để Settle SFN nested chạy y hệt lần đầu.
```

### 3.2. Vì sao `RestoreCycle` trước `StartSettleExecution`?

Khác với unified plan (ReconstructCycle SAU Settle) — plan này đảo
ngược thứ tự:

**Lý do**: nếu restore cycle về trạng thái pre-settle, thì Settle SFN
nested sẽ chạy **hoàn toàn y hệt lần đầu**, không cần biết nó là
resettle:
- `PrepareSettle` đọc active cycle (đã restore) → `jackpotOpeningAmount`
  giống lần đầu.
- `FinalizeSettle` không cần bypass cycle — cứ chạy `updateJackpotCycle`
  bình thường với kết quả mới.

→ **Loại bỏ hoàn toàn `resettleContext` khỏi `FinalizeSettle` và
`PrepareSettle`**. Chỉ còn `EnqueueDispatchPayouts` cần biết để dùng
batchKey resettle + sequence=1.

---

## 4. `RestoreCycleUseCase` — logic cụ thể

Input: `{ drawId }` (draw vừa republish về Published).

```ts
protected async execute(input: { drawId: string }) {
  const draw = await this.drawRepo.getDrawById(drawId);
  if (!draw?.jackpot?.preSettleCycleSnapshot) {
    // Không có snapshot → game nhóm A, hoặc settle cũ không ghi snapshot.
    // No-op.
    return { skipped: true };
  }

  const snap = draw.jackpot.preSettleCycleSnapshot;

  switch (snap.mutationType) {
    case "rollover":
      // Lần settle cũ chỉ updateCycleStats. Restore = ghi ngược
      // stats cũ.
      await this.cycleRepo.restoreCycleStats({
        cycleNo: snap.activeCycleNo,
        currentAmount: snap.currentAmount,
        totalContribution: snap.totalContribution,
        drawCount: snap.drawCount,
        peakAmount: snap.peakAmount,
        lastSettledDrawId: snap.lastSettledDrawId,
      });
      return { action: "restoredStats", cycleNo: snap.activeCycleNo };

    case "winner":
    case "split":
      // Lần settle cũ đóng cycle + tạo cycle mới. Restore:
      //   1. Delete cycle mới (createdNextCycleNo) nếu chưa có draw
      //      khác đụng vào — đã được đảm bảo bởi ràng buộc vàng.
      //   2. Reopen cycle đã closed về active, revert stats.
      if (snap.createdNextCycleNo != null) {
        await this.cycleRepo.deleteCycleByNo(snap.createdNextCycleNo);
      }
      await this.cycleRepo.reopenCycle({
        cycleNo: snap.activeCycleNo,
        currentAmount: snap.currentAmount,
        totalContribution: snap.totalContribution,
        drawCount: snap.drawCount,
        peakAmount: snap.peakAmount,
        lastSettledDrawId: snap.lastSettledDrawId,
      });
      return { action: "reopenedAndDeletedNext",
               reopened: snap.activeCycleNo,
               deleted: snap.createdNextCycleNo };
  }
}
```

### 4.1. Idempotent

- `restoreCycleStats` dùng `$set` tuyệt đối → replay nhiều lần cho kết
  quả giống nhau.
- `deleteCycleByNo` — nếu đã delete thì `deletedCount = 0`, no-op.
- `reopenCycle` — filter `status: closed` → nếu đã active thì no-op.

### 4.2. Tại sao an toàn xoá `createdNextCycleNo`?

Vì ràng buộc vàng: **không có draw nào settled sau anchor**, tức cycle
mới (`createdNextCycleNo`) có `drawCount = 0`, chưa có draw nào đóng
góp contribution. Xoá là vô hại.

Double-check an toàn: thêm assert:
```ts
async deleteCycleByNo(cycleNo: number) {
  const result = await this.deleteOne({ cycleNo, drawCount: 0 });
  // Nếu filter không match (drawCount > 0) → không xoá, throw.
  if (result.deletedCount === 0) {
    const cycle = await this.findOne({ cycleNo });
    if (cycle && cycle.drawCount > 0) {
      throw new Error(
        `Không thể xoá cycle ${cycleNo}: đã có ${cycle.drawCount} kỳ settled.`);
    }
  }
}
```

---

## 5. Thay đổi so với unified plan

| Unified plan | Simplified plan |
|--------------|-----------------|
| `ReconstructJackpotCycleUseCase` với 4 decision case phức tạp | `RestoreCycleUseCase` với 2 case đơn giản |
| 3 repo method mới: `reopenCycle`, `deleteCycleIfEmpty`, `overwriteCloseDetail` | 3 repo method: `restoreCycleStats`, `reopenCycle`, `deleteCycleByNo` (đơn giản hơn) |
| `FinalizeSettle` bypass cycle logic khi resettle | **Không bypass** — Settle SFN nested chạy y hệt lần đầu |
| `PrepareSettle` propagate `resettleContext` | **Không cần** propagate |
| `SettleContext.resettleContext` | **Chỉ** `EnqueueDispatchPayouts` cần biết |
| Cascade scope validation phức tạp | Chỉ cần check: không có draw settled sau anchor (đã là invariant) |
| SFN 5 state (ReconstructCycle sau Settle) | SFN 4 state (RestoreCycle trước Settle) |
| Bảng decision 4×4 (old × new outcome) | Không cần — Settle SFN tự handle |

Kết quả: **cắt ~50% complexity** của unified plan mà vẫn đúng cho game jackpot.

---

## 6. SFN chuẩn duy nhất cho CẢ 7 GAME

Với simplified plan, SFN Resettle có **4 state**, chỉ khác 1 state
tuỳ game:

```
State 1: PrepareResettle (Lambda)                  — chung 7 game
State 2: EnqueueReversals (Lambda, loop)           — chung 7 game
State 3: RestoreCycle (Lambda)                     — CHỈ game nhóm B,
                                                     nhóm A bỏ qua
State 4: StartSettleExecution (SFN sync:2)         — chung 7 game
```

Nhóm A (Keno/Bingo18/Max3d/Max3dPro): State 3 là **Pass state** (no-op)
hoặc có thể bỏ hẳn — dùng cùng ASL template nhưng set `Next` bỏ qua:

```json
// ASL template sharing:
"EnqueueReversalsLoop": {
  "Type": "Choice",
  "Choices": [
    {
      "Condition": "{% $enqueueResult.done && $prepareResult.hasCycleSnapshot %}",
      "Next": "RestoreCycle"
    },
    {
      "Condition": "{% $enqueueResult.done %}",
      "Next": "StartSettleExecution"
    }
  ],
  "Default": "EnqueueReversals"
}
```

Hoặc đơn giản hơn: `PrepareResettle` trả `hasCycleSnapshot: boolean`,
SFN route based on đó. Cả 7 game dùng **cùng 1 ASL file template**.

---

## 7. Power655 (2 pool) trong simplified plan

Ràng buộc vàng vẫn áp dụng → `draw.jackpot` chứa **2 snapshot**:

```ts
// Power655 draw doc
export interface DrawJackpotSnapshot {
  jackpot1: {
    openingAmount: number;
    closingAmount: number;
    preSettleCycleSnapshot: CyclePreSettleSnapshot;
  };
  jackpot2: {
    openingAmount: number;
    closingAmount: number;
    preSettleCycleSnapshot: CyclePreSettleSnapshot;
  };
}
```

`RestoreCycleUseCase` của Power655 restore **song song 2 pool**:

```ts
await Promise.all([
  this.restorePool(snap.jackpot1, pool1CycleRepo),
  this.restorePool(snap.jackpot2, pool2CycleRepo),
]);
```

Mỗi pool độc lập — không cần atomic cross-cycle (không thể và không
cần vì snapshot per-pool đã hoàn chỉnh).

---

## 8. Migration: thêm snapshot field cho draws sắp tới

Lúc deploy:
- Draws đã settled từ TRƯỚC không có `preSettleCycleSnapshot` →
  `RestoreCycleUseCase` skip (no-op) → không resettle được.
- Draws settled SAU deploy → có snapshot → resettle được.

Điều này **chấp nhận được** vì:
- Resettle chỉ dùng cho kỳ vừa settle. Draws cũ đã được thanh toán, không
  cần resettle.
- Nếu cần resettle draw cũ (hy hữu) → fallback sang manual SQL/script
  ops, không qua SFN.

Không cần data migration. Schema thay đổi (thêm field optional) là
backward compat.

---

## 9. Invariant check ở `PrepareResettle`

Simplified plan thay vì cascade scope, chỉ cần **1 invariant check**:

```ts
const settledAfter = await this.drawRepo.countSettledAfter(drawId);
if (settledAfter > 0) {
  throw BadRequestError(
    `Có ${settledAfter} kỳ settled sau ${drawId}. ` +
    `Resettle chỉ áp dụng cho kỳ settled gần nhất.`);
}
```

Query đơn giản: `count({ status: Settled, $or: [{drawDate > anchor.drawDate},
{drawDate = anchor.drawDate, drawNo > anchor.drawNo}] })`.

Nếu = 0 → OK. Nếu > 0 → reject. Không có mode cascade — đơn giản, an toàn.

---

## 10. Sequence tổng thể cuối cùng

```
┌─────────────────────────────────────────────────────────────┐
│ BO BƯỚC 1: POST /republish-result                          │
│   - Validate draw.status === Settled                        │
│   - Validate: countSettledAfter(drawId) === 0              │
│   - $set status=Published, result=newResult                 │
│   - $unset financial, stats, settleSummary, settledAt,     │
│            jackpot (CẢ preSettleCycleSnapshot)             │
│                                                             │
│   Lưu ý: KHÔNG đụng cycle ở bước này.                      │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ BO BƯỚC 2: POST /resettle → SFN 4 state                    │
│                                                             │
│  1. PrepareResettle                                        │
│     - Validate draw.status === Published                   │
│     - Validate: countSettledAfter === 0 (double-check)     │
│     - Preflight outbox: pending orders === 0               │
│     - Sinh resettleId + batchKey                           │
│     - clearReversalSnapshot                                │
│     - snapshotReversalsForDraw (sinh reversal.reversalTx) │
│     - resetEntriesForResettle (Settled → Scheduled)        │
│     - Load previousJackpotSnapshot từ DB (đã clear ở bước │
│       republish → phải load SNAPSHOT trước đó).           │
│                                                             │
│     ⚠️ Vấn đề: republish đã $unset jackpot. Làm sao        │
│     RestoreCycle biết snapshot cũ?                         │
│                                                             │
│     FIX: republish-result KHÔNG $unset jackpot. Chỉ clear  │
│     những field không cần. Giữ lại jackpot snapshot cho    │
│     RestoreCycle đọc. FinalizeSettle lần mới sẽ overwrite │
│     jackpot field với snapshot mới.                        │
│                                                             │
│  2. EnqueueReversals (loop)                                │
│     - Cursor + bulk insert reversal orders vào outbox     │
│                                                             │
│  3. RestoreCycle (Lambda — chỉ game nhóm B)                │
│     - Đọc draw.jackpot.preSettleCycleSnapshot              │
│     - Rollover → restoreCycleStats                         │
│     - Winner/Split → reopenCycle + deleteCycleByNo         │
│                                                             │
│  4. StartSettleExecution (SFN sync:2)                      │
│     - Nested Settle SFN chạy Y HỆT lần đầu                │
│     - Input: { drawId, resettleContext: { batchKey } }    │
│     - Settle SFN:                                          │
│       PrepareSettle (không cần biết resettle — đọc cycle  │
│         đã restore, đúng y hệt lần đầu)                    │
│       → SettleEntries → CalculateFinancials               │
│       → CheckPrizeRoute → Patch/Split nếu cần             │
│       → SyncTicketSummaries → BuildReport                  │
│       → PublishSettleDaily → PublishPlayerDaily           │
│       → FinalizeSettle (chạy updateJackpotCycle bình      │
│         thường — cycle đã được restore về pre-settle)     │
│       → EnqueueDispatchPayouts (đọc resettleContext cho   │
│         batchKey + sequence=1)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Điều chỉnh `republish-result` để giữ snapshot

File: `apps/backoffice/src/app/api/lotto535/draws/[drawId]/republish-result/route.ts`

```ts
await drawRepo.republishResultAfterSettled(drawId, newResult);
// Implementation:
//   $set: { status: Published, result: newResult, updatedAt: now }
//   $unset: { financial: "", stats: "", settleSummary: "", settledAt: "" }
//   GIỮ LẠI: jackpot (cả openingAmount, closingAmount, preSettleCycleSnapshot)
```

Lý do giữ `jackpot`:
- `preSettleCycleSnapshot` cần cho `RestoreCycle`.
- `openingAmount/closingAmount` sẽ được `FinalizeSettle` lần mới
  overwrite — không ảnh hưởng.

---

## 12. Checklist thực thi (cập nhật)

### Chung (7 game)
- [ ] Entity: `EntryReversal` interface + `reversal?` field
- [ ] Entry repo: 4 methods (snapshot/reset/clear/getEntriesWithReversal)
- [ ] Draw repo: `republishResultAfterSettled` (giữ `jackpot`),
      `countSettledAfter`
- [ ] Dispatch order repo: `findRecentBatchKeyByDraw`
- [ ] `PrepareResettleUseCase` (4 game nhóm A dùng 100% identical)
- [ ] `EnqueueReversalsUseCase` (identical)
- [ ] `EnqueueDispatchPayoutsUseCase`: đọc `resettleContext` (chỉ
      thay đổi duy nhất trong settle pipeline)
- [ ] Worker handlers: `prepare`, `enqueue-reversals`
- [ ] SFN ASL template dùng chung
- [ ] BO API + UI 2 nút riêng biệt

### Bổ sung nhóm B (Lotto535/Mega645/Power655)
- [ ] Entity: `CyclePreSettleSnapshot` + gắn vào `DrawJackpotSnapshot`
- [ ] `FinalizeSettleUseCase`: ghi `preSettleCycleSnapshot` cùng
      `settleComplete` (atomic)
- [ ] `FinalizeSettleUseCase`: sau khi tạo cycle mới, update
      `preSettleCycleSnapshot.createdNextCycleNo`
- [ ] Cycle repo: `restoreCycleStats`, `reopenCycle`, `deleteCycleByNo`
- [ ] `RestoreCycleUseCase` (per game — Power655 handle 2 pool)
- [ ] Worker handler: `restore-cycle`
- [ ] SFN: thêm state `RestoreCycle` (được Choice skip cho nhóm A)

---

## 13. So sánh 3 plan

| Khía cạnh | Unified (ReconstructCycle) | Simplified (RestoreCycle) | Keno-only |
|-----------|----------------------------|---------------------------|-----------|
| Số SFN state | 5 | 4 | 4 |
| Decision tree complexity | 4×4 matrix | 2 case (rollover vs close) | N/A |
| Settle pipeline modification | `FinalizeSettle` bypass + `PrepareSettle` propagate + `EnqueueDispatchPayouts` | **Chỉ** `EnqueueDispatchPayouts` + `FinalizeSettle` ghi thêm snapshot | Chỉ `EnqueueDispatchPayouts` |
| Backward compat draws cũ | Phức tạp — phải aggregate lại | Không support resettle draws cũ (no snapshot) | N/A |
| Cover nhóm A | Qua config skip | Qua SFN Choice skip | Native |
| Cover nhóm B | ✅ nhiều cycle | ✅ chỉ cycle gần nhất | ❌ |
| Rủi ro | Cao (aggregate lại stats) | Thấp (restore snapshot tuyệt đối) | N/A |

**Khuyến nghị**: dùng **Simplified plan** cho production. Unified
plan giữ làm fallback nếu sau này nghiệp vụ đổi cho phép resettle
draws cũ hơn.

---

## 14. Rủi ro còn lại và mitigation

### 14.1. Snapshot bị corrupt / thiếu

Nếu `preSettleCycleSnapshot` không được ghi (do crash giữa
`settleComplete` và `updateJackpotCycle`) → `RestoreCycle` không biết
restore về đâu.

**Mitigation**: ghi snapshot **atomic cùng settleComplete** (1 query
$set), không tách thành 2 step.

### 14.2. Resettle nhiều lần cùng 1 kỳ

Lần 1: resettle từ kết quả X → kết quả Y. Lần 2: resettle tiếp từ Y → Z.

- Sau lần 1: `draw.jackpot.preSettleCycleSnapshot` đã được overwrite
  bởi `FinalizeSettle` lần 2 (vì Settle SFN nested chạy y hệt settle
  lần đầu và ghi lại snapshot).
- Lần 2 restore từ snapshot mới (ghi bởi settle lần mới) → đúng.
- Invariant: mỗi lần settle (kể cả trong resettle) đều ghi snapshot
  pre-settle của cycle **tại thời điểm đó** → idempotent resettle N lần.

Ví dụ:
```
T0: Settle lần 1  → cycle={curr=10B, cnt=3} → snapshot ghi {10B, 3}
     mutation: closeCycle (vì winner)
     cycle now: closed, next cycle tạo với seed=2B
T1: Resettle (newResult không winner)
     RestoreCycle đọc snapshot {10B, 3}:
       - reopenCycle → active, curr=10B, cnt=3
       - deleteCycleByNo(nextCycleNo)
     Settle nested: cycle active {curr=10B, cnt=3}
       → PrepareSettle load curr=10B (jackpotOpeningAmount)
       → FinalizeSettle ghi snapshot MỚI {10B, 3} + rollover mutation
       → cycle sau: {curr=10B+newContrib, cnt=4}
T2: Resettle LẦN 2 (newResult có winner)
     RestoreCycle đọc snapshot {10B, 3} (ghi lúc T1 chạy Settle nested):
       - restoreCycleStats → curr=10B, cnt=3 (về lại trước T1)
       - KHÔNG có cycle mới để xoá (T1 rollover)
     Settle nested: cycle active {curr=10B, cnt=3}
       → FinalizeSettle ghi snapshot {10B, 3} + winner mutation
       → closeCycle + createNext
```

Hoàn toàn idempotent và convergent.

### 14.3. Ràng buộc vàng bị vi phạm

Nếu staff quên check, tạo draw mới hoặc settle kỳ khác trước khi
resettle → `countSettledAfter > 0` → reject với message rõ ràng.

Không có cách nào hỏng invariant mà plan không detect được.

---

## 15. Kết luận

Với ràng buộc vàng "resettle chỉ kỳ vừa settled gần nhất":

1. **Bài toán cascade biến mất hoàn toàn.**
2. **`RestoreCycle` chỉ cần snapshot-and-undo** — 2 case đơn giản.
3. **Settle SFN nested chạy Y HỆT lần đầu**, không cần biết
   resettleContext cho logic settle (chỉ `EnqueueDispatchPayouts`
   cần — như Keno plan).
4. **SFN 4 state** cho cả 7 game (nhóm A skip state `RestoreCycle`
   qua Choice).
5. **Convergent** khi resettle N lần — snapshot luôn được ghi mới
   mỗi lần settle nested chạy.

Đây là phiên bản plan khuyến nghị để implement.

