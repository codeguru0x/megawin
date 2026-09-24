# Unified Resettle Plan — Áp dụng cho mọi game (Keno + Jackpot cycle games)

> Tài liệu này mở rộng `keno_resettle.plan.md` để xử lý các game CÓ
> **Jackpot cycle** (Lotto 5/35, Power 6/55, Mega 6/45). Mục tiêu là
> lấy ra 1 **quy trình chuẩn** áp dụng cho tất cả 7 game, chỉ khác ở
> **game-specific hooks** được document rõ ràng.

## 0. Bảng phân loại game

| Game | Flat prize | Jackpot cycle | Split cycle | Cross-draw coupling |
|------|------------|---------------|-------------|---------------------|
| Keno | ✅ | ❌ | ❌ | Không |
| Bingo18 | ✅ | ❌ | ❌ | Không |
| Max3d | ✅ | ❌ | ❌ | Không |
| Max3dPro | ✅ | ❌ | ❌ | Không |
| Lotto535 | ✅ | ✅ | ✅ (threshold) | **Có** (cycle kéo dài nhiều kỳ) |
| Mega645 | ✅ | ✅ | ❌ | **Có** |
| Power655 | ✅ | ✅ | ✅ (2 pool: JP1/JP2) | **Có** |

Phân chia này xác định mức độ phức tạp của resettle:
- **Nhóm A** (Keno/Bingo18/Max3d/Max3dPro): quy trình Keno plan áp dụng
  100% không sửa.
- **Nhóm B** (Lotto535/Mega645/Power655): cần **mở rộng** để xử lý
  JackpotCycle rollback/reopen/reconstruct.

---

## 1. Vấn đề cốt lõi với game Jackpot cycle

Settle Lotto535 không chỉ ghi entry.payout — còn:

1. **Đóng cycle** (`closeCycle`) khi có winner hoặc split → status
   `active → closed`, ghi `endDrawId`, `winners`, `splitDetail`.
2. **Tạo cycle mới** (`createCycle`) với seedAmount, gán `startDrawId`
   = next draw.
3. **Cập nhật cycle stats** (`updateCycleStats`) — `currentAmount`,
   `totalContribution`, `drawCount`, `peakAmount` khi roll-over.
4. **Snapshot jackpot trên draw doc** (`draw.jackpot.openingAmount/
   closingAmount/isSplitCycle`) — ảnh hưởng draws **KẾ TIẾP** vì chúng
   đọc `activeCycle.currentAmount` tại `PrepareSettle`.

**Resettle ở nhóm B → vấn đề:**

### Vấn đề R-JP-1: Cycle đã đóng sai

Kỳ bị resettle vốn `closeCycle` vì kết quả cũ có JP winner. Kết quả mới
không có winner → cycle lẽ ra KHÔNG được đóng. Ngược lại: kết quả cũ
không có winner (đã `updateCycleStats` roll-over), kết quả mới có
winner → cần đóng cycle và tạo cycle mới.

**Hệ quả**: `JackpotCycleStatus` phải có thể rollback từ `closed →
active`, hoặc hủy cycle mới được tạo.

### Vấn đề R-JP-2: Cycle chain đã trôi nhiều kỳ

Giả sử kỳ `2026-02-24.001` (draw A) đã settle sai với kết quả có JP
winner, đóng cycle `JP-007`, mở cycle `JP-008`. Sau đó các kỳ
`.002, .003, …` (draw B, C, …) đã settle trên cycle `JP-008` (tích luỹ
hoặc thậm chí close cycle `JP-008`).

Khi resettle draw A:
- Cycle `JP-007` cần reopen → giữ contribution.
- Cycle `JP-008` (và `JP-009` nếu có) → **đã có draw khác settled trên
  đó**. Resettle draw A không thể chỉ "xoá" cycle `JP-008` vì
  contribution/stats của draw B, C sẽ mất.
- Phải **cascade re-aggregate**: sau resettle draw A, rebuild cycle
  chain từ A trở đi dựa trên kết quả mới.

**Hệ quả**: Resettle 1 draw trong nhóm B có thể đòi hỏi **re-process
toàn bộ draws sau nó** trên cùng cycle chain.

### Vấn đề R-JP-3: Draws kế tiếp đã đọc sai `jackpotOpeningAmount`

Draw B settle với `jackpotOpeningAmount = seedAmount` (vì cycle
`JP-008` vừa mở). Nếu draw A resettle → không có winner → draw B lẽ ra
phải đọc `jackpotOpeningAmount = currentAmount của JP-007` sau draw A.

→ Tất cả `draw.financial`, `draw.jackpot`, `entry.payout` (nếu trúng
tier1-tier5 trong split cycle), report của draw B đều **sai**.

**Hệ quả**: Resettle phải **void + rebuild** tất cả draws sau A trong
cùng chain hoặc reject nếu có draws sau đã settled.

### Vấn đề R-JP-4: Dispatch reversal jackpot winner

JP winner nhận `jackpotPerWinner = floor((opening+contribution) / N)`
— con số khổng lồ (tỷ VND). Nếu resettle sinh reversal `reversalAmount
= payout.payoutAmount` → cần gửi lệnh thu hồi hàng tỷ về tenant. Quy
trình reversal Keno hiện tại đã xử lý được (unique tx, sequence=0)
nhưng cần **cảnh báo UI** về mức độ nghiêm trọng và yêu cầu
approval bổ sung (4-eyes).

### Vấn đề R-JP-5: Seed amount thay đổi giữa phiên

`JackpotCycleConfig` snapshot `seedAmount`, `splitThreshold`,
`splitRatios` lúc `createCycle`. Nếu admin đã đổi global config giữa
lần settle đầu và resettle → cycle mới tạo lúc resettle có thể khác
cycle cũ. **Phải dùng snapshot cũ** của cycle đã tồn tại, không đọc
lại global config.

---

## 2. Mô hình chuẩn: "Cascade Resettle"

Để giải quyết R-JP-1..5, mở rộng plan Keno thêm **2 phase chung**:

### Phase 0 — Preflight cascade scope (mới, chỉ nhóm B)

Trước khi bất cứ thay đổi nào xảy ra, xác định:

1. **Anchor draw** = draw đang resettle (draw A).
2. **Affected cycle chain** = tất cả cycles có `startDrawId >=
   anchor.drawId` HOẶC `endDrawId >= anchor.drawId` HOẶC chính cycle
   chứa anchor.
3. **Affected draws** = tất cả draws có `drawDate/drawNo >= anchor`
   trong chain đó, status ∈ `{Settling, Settled, Published, SalesClosed,
   SalesOpen, Scheduled}`.

Nếu **bất kỳ** affected draw nào ở status `Settling` hoặc có
`tenant_dispatch_orders` pending → **reject resettle với 409**.

Nếu có draws đã `Settled` sau anchor → 2 lựa chọn:
- **Strict mode (mặc định)**: reject + yêu cầu void các kỳ sau trước.
- **Cascade mode (opt-in)**: UI cảnh báo và cho phép cascade void +
  rebuild. Plan này mặc định STRICT.

### Phase 6 — Cycle reconstruction (mới, chỉ nhóm B)

Sau Settle SFN nested chạy xong (đã có `new financials + jackpot
winners`), Resettle SFN chạy thêm state `ReconstructCycle` để:

1. Reopen cycle cũ nếu cần (rollback `close → active`) HOẶC đóng cycle
   hiện tại theo kết quả mới.
2. Re-aggregate stats cho cycle chứa anchor dựa trên **tất cả** draws
   đã settle trong chain (tính từ `startDrawId` đến draw gần nhất
   settled).
3. Invalidate cycle-level caches + re-publish cycle summary report.

---

## 3. Quy trình chuẩn unified (4 tầng)

```
TẦNG 1: ENTITY CONTRACT (chung)
  - EntryReversal interface (cùng cấp payout, top-level trên entry)
  - DrawStatus transitions bổ sung: Settled → Published
  - reversal?: EntryReversal → entry schema

TẦNG 2: REPO METHODS (chung + game hooks)
  A. Chung (7 game đều cần):
     - entryRepo.snapshotReversalsForDraw(drawId, resettleId)
     - entryRepo.resetEntriesForResettle(drawId)
     - entryRepo.clearReversalSnapshot(drawId)
     - entryRepo.getEntriesWithReversalForDispatch(...)
     - drawRepo.republishResultAfterSettled(drawId, result)
     - drawRepo + VALID_TRANSITIONS cập nhật
     - dispatchOrderRepo.findRecentBatchKeyByDraw(gameId, drawId)
  B. Game Nhóm B (Lotto535/Mega645/Power655):
     - jackpotCycleRepo.reopenCycle(cycleNo) // closed → active
     - jackpotCycleRepo.deleteCycleIfEmpty(cycleNo)
     - jackpotCycleRepo.recomputeStatsFromDraws(cycleNo, draws[])
     - drawRepo.listSettledDrawsInCycle(cycleNo)
     - drawRepo.listAffectedDrawsAfter(anchorDrawId, cycleNo)

TẦNG 3: USE CASES (chung skeleton + game-specific body)
  A. Chung:
     - PrepareResettleUseCase (skeleton identical 7 game)
     - EnqueueReversalsUseCase (identical 7 game)
  B. Game Nhóm B:
     - ReconstructJackpotCycleUseCase (per game, khác logic
       winner/split/rollover nhưng cùng interface)
     - ValidateCascadeScopeUseCase (bổ sung ở PrepareResettle
       cho nhóm B)

TẦNG 4: STEP FUNCTION ORCHESTRATION
  A. Nhóm A SFN (Keno template — 4 state):
     PrepareResettle → EnqueueReversals(loop) → StartSettleExecution → End
  B. Nhóm B SFN (mở rộng — 5 state):
     PrepareResettle → EnqueueReversals(loop) → StartSettleExecution
       → ReconstructCycle → End
```

---

## 4. Decision tree: reconstruct cycle sau resettle

Sau khi Settle SFN nested chạy xong với kết quả mới, tình huống có thể
rơi vào 1 trong 4 case. Lý do tiếp cận này: phần cycle update ở
`FinalizeSettle` khi chạy lần đầu **đã đóng/mở cycle theo kết quả cũ**
— nested Settle SFN chạy lại sẽ thấy cycle không còn `active` hoặc ở
trạng thái đã mutate → logic lần hai sẽ **lệch**. Do đó, **`ReconstructCycle`
state phải chạy TRƯỚC khi Settle SFN nested chạy lại**, hoặc `FinalizeSettle`
phải biết bypass cycle logic khi có `resettleContext`.

**Quyết định thiết kế (chốt):**
- `FinalizeSettle` **bypass toàn bộ cycle update** khi `resettleContext !=
  null` — chỉ transition `Settling → Settled` + ghi `jackpot snapshot trên
  draw doc`.
- `ReconstructCycle` state (mới) chạy SAU `FinalizeSettle` để handle cycle
  riêng biệt, có full context `{oldOutcome, newOutcome}`.

### 4.1. Trạng thái cycle trước resettle

Đặt:
- `anchorCycle` = cycle mà `anchor.drawId` thuộc về (đã closed hoặc
  vẫn active).
- `oldOutcome` = (hasJpWinner, splitExecuted, rollover) lần settle cũ.
- `newOutcome` = tính lại sau resettle.

| Old → New | Cycle action | Next cycle action |
|-----------|-------------|-------------------|
| Rollover → Rollover | `updateCycleStats` với stats mới | Không |
| Rollover → Winner/Split | `closeCycle` anchorCycle | `createCycle` mới |
| Winner/Split → Rollover | `reopenCycle` anchorCycle | `deleteCycleIfEmpty` cycle sau |
| Winner/Split → Winner/Split | `closeCycle` (overwrite winners/splitDetail) | Giữ cycle sau nếu đã có draws settled; nếu trống → `deleteCycleIfEmpty` + `createCycle` mới |

### 4.2. Điều kiện tiên quyết (strict mode)

Precondition của resettle với nhóm B:
- **KHÔNG có draw settled sau anchor**, hoặc:
- Các draw settled sau anchor nằm **cùng cycle** với anchor (không
  cross cycle boundary).

Điều này đảm bảo reconstruct chỉ đụng 1 cycle.

Nếu có draws settled đã băng qua cycle sau → reject với message:
> "Kỳ {drawId} thuộc cycle đã đóng và đã có {N} kỳ settled trên cycle
> mới. Phải void các kỳ đó trước khi resettle."

---

## 5. `ReconstructJackpotCycleUseCase` — contract chung

Interface thống nhất cho 3 game nhóm B:

```ts
export interface ReconstructCycleInput {
  drawId: string;        // anchor draw
  resettleId: string;
  batchKey: string;
  // Snapshot TRƯỚC resettle (lấy từ PrepareResettle, trước khi reset).
  previousOutcome: {
    hasJackpotWinner: boolean;
    splitExecuted: boolean;
    closedCycleNo?: number;   // nếu lần cũ đã đóng
    createdCycleNo?: number;  // cycle mới đã tạo sau lần cũ
  };
}

export interface ReconstructCycleOutput {
  drawId: string;
  actions: Array<
    | { type: "reopenCycle"; cycleNo: number }
    | { type: "closeCycle"; cycleNo: number; reason: string }
    | { type: "deleteCycle"; cycleNo: number }
    | { type: "createCycle"; startDrawId: string; seedAmount: number }
    | { type: "updateStats"; cycleNo: number; currentAmount: number }
  >;
  resultingActiveCycleNo: number;
}
```

### 5.1. Flow cho Lotto535 `ReconstructJackpotCycleUseCase`

1. Load `anchorDraw` (đã ở `Settled`, vừa finalized bởi Settle SFN
   nested — có `draw.financial`, `draw.jackpot`, `draw.settleSummary`
   mới).
2. Đọc `financials` từ `anchorDraw.financial` + `settleSummary` để suy
   ra `newOutcome = {hasJpWinner, splitExecuted}`.
3. Xét decision table §4.1, gọi repo methods tương ứng.
4. Sau khi reshape cycle, gọi `ensureNextCycleExists(drawId,
   snapshotConfig)` — bắt buộc dùng **snapshot config từ cycle cũ**,
   không đọc global config (xử lý R-JP-5).
5. Ghi audit log chi tiết actions vào `system_audit_logs`.

### 5.2. Repo methods mới cho nhóm B

```ts
// JackpotCycleRepository
async reopenCycle(cycleNo: number): Promise<boolean> {
  // filter: status=closed, cycleNo → update $set status=active,
  //   $unset closedAt, endDrawId, closeReason, splitDetail, winners
  // return modifiedCount > 0
}

async deleteCycleIfEmpty(cycleNo: number): Promise<boolean> {
  // Precondition: KHÔNG có draw settled nào có
  //   drawId IN (drawsInCycle). Nếu có → throw.
  // deleteOne({ cycleNo, status: 'active', drawCount: 0 })
}

async overwriteCloseDetail(cycleNo: number, detail: {...}): Promise<void> {
  // Cho case Winner → Split hoặc ngược lại — cycle đã closed, chỉ
  // update winners/splitDetail/closeReason/finalAmount.
}
```

### 5.3. Bypass logic trong `FinalizeSettleUseCase`

File `packages/game-lotto535-application/src/use-cases/settle/finalize-settle.ts`:

```ts
protected async execute(input: SettleContextWithFinancials) {
  const { drawId, resettleContext } = input;
  // Bước 1: transition draw Settling → Settled + jackpot snapshot
  //   → giữ nguyên như cũ.
  const updated = await this.drawRepo.settleComplete(drawId, { ... });

  // Bước 2: Cycle update
  if (resettleContext) {
    // Bypass — ReconstructCycle state sẽ handle
    return { drawId, status: Settled, closingJackpot: ..., completedAt };
  }
  await this.updateJackpotCycle(input);
  // ...
}
```

Thay đổi tối thiểu, không đụng test case settle cũ.

---

## 6. `PrepareResettleUseCase` mở rộng cho nhóm B

So với Keno plan, thêm 3 bước:

```ts
async execute(input: PrepareResettleInput): Promise<PrepareResettleOutput> {
  // ── Bước 1-4 giống Keno: load draw, validate status, preflight outbox,
  //    sinh resettleId + batchKey, clearReversalSnapshot.

  // ── Bước 5 (MỚI — nhóm B): Cascade scope validation ──
  const affectedDraws = await this.drawRepo.listAffectedDrawsAfter(
    drawId, anchorCycle.cycleNo);
  if (affectedDraws.some(d => d.status === DrawStatus.Settling)) {
    throw ConflictError("Có kỳ đang settling trong chain. Đợi hoàn tất.");
  }
  if (affectedDraws.some(d => d.status === DrawStatus.Settled)) {
    throw BadRequestError(
      `Có ${N} kỳ đã settled sau ${drawId}. Void các kỳ đó trước.`);
  }

  // ── Bước 6 (MỚI — nhóm B): Snapshot previousOutcome ──
  // Đọc từ draw doc TRƯỚC khi reset: jackpot snapshot + settleSummary
  // + cycle đã closed (findClosedByEndDrawId) → xác định
  // { hasJackpotWinner, splitExecuted, closedCycleNo, createdCycleNo }.
  const previousOutcome = await this.snapshotPreviousOutcome(drawId);

  // ── Bước 7-9: Giống Keno (snapshotReversals, resetEntries,
  //    không đụng draw.result — đã republish trước đó).

  // ── Bước 10 (MỚI — nhóm B): Reset draw.jackpot + draw.financial ──
  // republishResultAfterSettled đã $unset financial, jackpot, settleSummary.
  // Không cần thêm.

  return {
    drawId, resettleId, batchKey, reversalCount, resetCount,
    previousOutcome,  // pass xuống SFN để ReconstructCycle dùng
  };
}
```

`PrepareResettleOutput.previousOutcome` được SFN propagate xuống
`ReconstructCycle` state qua ResultPath.

---

## 7. Step Function design (nhóm B — 5 state)

```
Input: { drawId }

PrepareResettle (Task Lambda)
  Output: { drawId, resettleId, batchKey, reversalCount, resetCount,
            previousOutcome }
  Next: EnqueueReversalsLoop

EnqueueReversalsLoop (Choice)
  done=true → StartSettleExecution
  done=false → EnqueueReversals

EnqueueReversals (Task Lambda)
  Next: EnqueueReversalsLoop

StartSettleExecution (Task states:startExecution.sync:2)
  Input: { drawId, resettleContext: { resettleId, batchKey } }
  ResultPath: $.settleExecution
  Next: ReconstructCycle

ReconstructCycle (Task Lambda)  ← MỚI
  Input: { drawId, resettleId, batchKey, previousOutcome }
  Retry: Lambda errors 3x, BadRequestError/ConflictError → End with error
  End: true
```

**Khác biệt với Keno SFN**: thêm state `ReconstructCycle` sau
`StartSettleExecution`.

---

## 8. Game-specific matrix

Bảng tổng hợp những thứ mỗi game phải cung cấp để plan unified chạy:

| Hook | Keno / Bingo18 / Max3d(Pro) | Lotto535 | Mega645 | Power655 |
|------|----------------------------|----------|---------|----------|
| `EntryReversal` | ✅ chung | ✅ chung | ✅ chung | ✅ chung |
| `DrawStatus` transitions | ✅ chung | ✅ chung | ✅ chung | ✅ chung |
| `republishResultAfterSettled` | ✅ clear `financial/stats/settleSummary/settledAt` | Cộng thêm `$unset jackpot` | Cộng thêm `$unset jackpot` | Cộng thêm `$unset jackpot1, jackpot2` |
| `PrepareResettle` | Base | +Cascade scope +snapshot previousOutcome | giống Lotto535 | giống Lotto535 (thêm snapshot JP1/JP2 riêng) |
| `FinalizeSettle` bypass | N/A | Bypass `updateJackpotCycle` khi có `resettleContext` | Tương tự | Tương tự (bypass cả JP1 và JP2 pool) |
| `ReconstructCycle` use case | N/A | Có | Có (đơn giản hơn, không split) | Có (phức tạp nhất — 2 pool độc lập) |
| SFN state count | 4 | 5 | 5 | 5 |
| Reversal amount đặc biệt | payoutAmount | payoutAmount (có thể >1 tỷ khi JP winner) | tương tự | payoutAmount (có thể cực lớn với JP1) |

---

## 9. Power655 đặc biệt (2 pool)

Power655 có **JP1 (pool chính) + JP2 (pool phụ)** độc lập. Mỗi pool:
- Có cycle riêng (`power655_jackpot1_cycles`, `power655_jackpot2_cycles`).
- Có close reason riêng.
- Có thể close cùng kỳ hoặc khác kỳ.

`ReconstructJackpotCycleUseCase` cho Power655 phải xử lý **2 cycle
chain song song**:

```ts
const [jp1Actions, jp2Actions] = await Promise.all([
  this.reconstructPool1(input),
  this.reconstructPool2(input),
]);
```

Mỗi pool chạy decision table §4.1 độc lập. Không có ràng buộc chéo —
pool 1 có thể reopen trong khi pool 2 giữ nguyên.

**Precondition strict mode**: nếu có draws settled sau anchor trên
bất kỳ pool nào → reject. Áp dụng union của 2 cycle chain.

---

## 10. Edge cases cần xử lý rõ

### 10.1. Resettle khi cycle đã bị đóng bởi `manual_reset`

Admin có thể `manual_reset` cycle giữa chừng. Nếu resettle chạm cycle
đã closed by manual_reset → **reject**, vì cycle lifecycle đã bị admin
override. Không auto reopen.

### 10.2. Resettle mà new result cũng có JP winner nhưng số winners khác

Old: 1 winner nhận 10 tỷ. New: 3 winners chia 10 tỷ (mỗi người ~3.3
tỷ).
- Reversal: thu hồi 10 tỷ của winner cũ (sequence=0).
- Payout mới: trả 3.3 tỷ × 3 người (sequence=1).
- Cycle action: `overwriteCloseDetail` — cùng cycleNo, update
  `winners[]` và `finalAmount`.
- `createdCycleNo` (cycle mới) giữ nguyên — không cần delete/recreate
  vì `startDrawId` không đổi.

### 10.3. Resettle đổi từ rollover → split

Edge trong Lotto535: old rollover chỉ `updateCycleStats`, new split
cycle phải `closeCycle` + `createCycle` mới.
- Reconstruct: `closeCycle(anchorCycle, reason=Split, splitDetail)`
  → `createCycle({startDrawId: nextDraw, seedAmount: snapshotSeed})`.
- Lưu ý snapshot seedAmount từ config tại thời điểm cycle cũ, không
  đọc global config hiện tại (R-JP-5).

### 10.4. Void kỳ TRONG KHI resettle đang chạy

Worker Void + Worker Resettle chạy parallel. Nếu void kỳ khác trong
cùng cycle chain trong lúc resettle chạy:
- Void enqueue refund order với batchKey `${game}:void:${drawId}:refund`
  — khác prefix resettle → không conflict outbox.
- Cycle chain không ảnh hưởng vì void có route cycle riêng (từ
  `build-void-report` + `void-entries` không đụng cycle).
- Tuy nhiên UI BO phải **hiển thị** trạng thái 2 SFN song song để staff
  biết.

Chốt: **ở nhóm B, disable void cho các draws trong cycle chain khi
resettle đang chạy** — UI lock via `aggregateBatchProgress`.

### 10.5. ReconstructCycle fail sau khi reversal + settle đã chạy

Nếu Settle SFN nested hoàn tất nhưng `ReconstructCycle` fail:
- Entries đã được settle lại chính xác.
- Reversal + payout đã enqueue (đang dispatch async).
- Cycle vẫn ở trạng thái cũ (FinalizeSettle bypass) → **inconsistent**.

Xử lý: `ReconstructCycle` dùng `Retry` + outer-loop `Wait 5 phút` như
`EnqueueDispatchPayouts` — retry vô hạn. Idempotent nhờ:
- `reopenCycle` filter `status=closed` → no-op nếu đã open.
- `closeCycle` filter `status=active` → no-op nếu đã closed.
- `overwriteCloseDetail` luôn overwrite (idempotent).
- `deleteCycleIfEmpty` filter `drawCount=0` → no-op nếu đã có draws.

### 10.6. Resettle chain — 2 kỳ liền nhau cùng bị sai

Admin sửa kỳ A rồi sửa kỳ B (B = A+1). Strict mode: phải xử lý A xong
(resettle complete) mới chạm B, vì khi resettle A → B còn ở Settled →
reject B.

**Quy trình staff**:
1. Resettle kỳ A (đợi hoàn tất, bao gồm dispatch xong).
2. Với kỳ B: vì kỳ A resettle xong đã clear `draw.financial/jackpot`
   của B KHÔNG — chỉ của A. B vẫn ở Settled với giá trị cũ → cần
   republish result B + resettle B tương tự.

Không tự động cascade vì:
- Rủi ro lớn (nhiều tỷ dispatch tự động).
- UI hiển thị rõ mỗi bước để staff kiểm soát.

---

## 11. Migration order cho 7 game

### Phase 1 — Keno (proof of concept, nhóm A template)

Đã chi tiết ở `keno_resettle.plan.md`. Chạy xong cho stable 2 tuần
trên staging trước khi phase 2.

### Phase 2 — Nhóm A còn lại (Bingo18, Max3d, Max3dPro)

Copy-paste template Keno, chỉ đổi game-specific identifiers
(`GameProduct`, collection prefix, description text). Thời lượng ~2
ngày/game.

### Phase 3 — Lotto535 (nhóm B pilot)

Implement full unified plan. Bao gồm:
- `ReconstructJackpotCycleUseCase`.
- 3 repo methods mới (`reopenCycle`, `deleteCycleIfEmpty`,
  `overwriteCloseDetail`).
- SFN 5 state.
- BO UI cascade warning.
- Strict mode reject khi có draws settled sau.

### Phase 4 — Mega645 + Power655

Mega645 cycle đơn giản hơn Lotto535 (không split) → direct port.
Power655 cần extend `ReconstructJackpotCycleUseCase` để xử lý 2 pool
song song.

---

## 12. Unified Checklist

### Chung (7 game)
- [ ] Entity: `EntryReversal` interface + `reversal?` field
- [ ] Entry repo: `snapshotReversalsForDraw`, `resetEntriesForResettle`,
      `clearReversalSnapshot`, `getEntriesWithReversalForDispatch`
- [ ] Draw repo: `republishResultAfterSettled` + `VALID_TRANSITIONS`
      cập nhật
- [ ] Dispatch order repo: `findRecentBatchKeyByDraw`
- [ ] `PrepareResettleUseCase` (skeleton chung)
- [ ] `EnqueueReversalsUseCase` (identical)
- [ ] `SettleContext.resettleContext` + propagate qua
      `PrepareSettleUseCase` và `EnqueueDispatchPayoutsUseCase`
- [ ] Worker handlers: `prepare`, `enqueue-reversals`
- [ ] SFN: `resettle.asl.json` + `resettle.yml`
- [ ] BO API: `/republish-result` + `/resettle`
- [ ] BO UI: 2 nút riêng biệt + progress polling

### Bổ sung nhóm B (Lotto535/Mega645/Power655)
- [ ] Draw repo: `listAffectedDrawsAfter`, `listSettledDrawsInCycle`
- [ ] Jackpot cycle repo: `reopenCycle`, `deleteCycleIfEmpty`,
      `overwriteCloseDetail`, `recomputeStatsFromDraws`
- [ ] `PrepareResettleUseCase`: Cascade scope validation + snapshot
      `previousOutcome`
- [ ] `FinalizeSettleUseCase`: bypass cycle update khi có
      `resettleContext`
- [ ] `ReconstructJackpotCycleUseCase` (per game — Power655 cần 2 pool)
- [ ] SFN: thêm state `ReconstructCycle`
- [ ] BO UI: cascade warning, disable void cho cycle chain đang
      resettle
- [ ] `draw.jackpot` clear trong `republishResultAfterSettled`

---

## 13. Rủi ro còn lại và lựa chọn thiết kế

| Rủi ro | Lựa chọn plan này | Alternative (không chọn) |
|--------|------------------|--------------------------|
| Cascade reconstruct phức tạp nhiều kỳ | **Strict mode**: reject nếu có draws settled sau | Auto cascade void + rebuild (quá rủi ro) |
| Admin đổi global config giữa phiên | Dùng **cycle snapshot config** | Re-read global config (có thể lệch) |
| Reversal dispatch tiền quá lớn | UI 4-eyes approval, log audit | Auto dispatch (rủi ro vận hành) |
| Cycle reopen race với draw mới tạo | `findAffectedDrawsAfter` filter + SFN serialize per game | Distributed lock (over-engineer) |
| Power655 2 pool không đồng bộ | Reconstruct **độc lập** 2 pool | Atomic transaction 2 cycle (Mongo không hỗ trợ cross-collection TX mức production) |

---

## 14. Kết luận

Quy trình Keno **áp dụng được** cho 3 game nhóm B với điều kiện:

1. **Mở rộng thêm 1 state SFN** (`ReconstructCycle`).
2. **Bypass** logic cycle trong `FinalizeSettle` khi có
   `resettleContext`.
3. **Strict mode** ở preflight — reject nếu có draws settled sau
   anchor trong cùng cycle chain.
4. **Thêm 4 repo methods** cho `JackpotCycleRepository`.
5. **Game-specific `ReconstructJackpotCycleUseCase`** nhưng dùng
   interface chung.

Với thiết kế này, **toàn bộ code Nhóm A (Keno/Bingo18/Max3d/Max3dPro)
KHÔNG phải sửa** khi implement nhóm B — quy trình unified nhưng
game-specific được cô lập qua hooks rõ ràng.



