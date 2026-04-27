# Keno Resettle Plan — Giai đoạn 2 (Phiên bản đã tối ưu)

## 1. Mục tiêu & nguyên tắc

Resettle xảy ra khi admin phát hiện **kết quả quay sai** của kỳ đã settled,
cần thu hồi tiền trả sai + trả lại theo kết quả đúng. Plan này áp cho Keno
trước, làm template cho 6 game còn lại.

**Nguyên tắc thiết kế (đã thảo luận và chốt):**

- **DRY tuyệt đối** — Resettle SFN chỉ làm "chuẩn bị dữ liệu" rồi gọi lại
  Settle SFN nguyên bản. Zero duplicate logic match/cap/report/publish.
- **KISS tuyệt đối** — Chỉ 2 use case mới, 2 Lambda mới, 4 state mới. So
  với approach "atomic-swap per entry" thì giảm ~60% code.
- **Idempotent đa tầng** — atomic `updateMany` + unique `tx` outbox + preflight
  guard + sequence blocking trong worker-tenant-dispatch.
- **Resettle N lần an toàn** — `resettleId` UUIDv7 mỗi phiên, batchKey
  phân tách hoàn toàn, clear reversal snapshot trước phiên mới.

---

## 2. Flow tổng quan

Nghiệp vụ tách thành **3 bước riêng biệt ở BO**:

```
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 1 — Sửa kết quả (staff thao tác ở BO)                 │
│                                                             │
│ POST /api/keno/draws/{drawId}/republish-result              │
│                                                             │
│   - Precondition: draw.status === Settled                  │
│   - drawRepo.republishResultAfterSettled(drawId, newResult)│
│   - Atomic: status Settled → Published                     │
│             result = newResult                             │
│             $unset financial, stats, settleSummary,        │
│                    settledAt                               │
│   - KHÔNG đụng entries. KHÔNG enqueue.                     │
│   - Chạy lại nhiều lần OK (idempotent qua status filter).  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 2 — Trigger Resettle (staff bấm nút riêng ở BO)       │
│                                                             │
│ POST /api/keno/draws/{drawId}/resettle                      │
│                                                             │
│   - Precondition:                                          │
│     + draw.status ∈ {Published, Settled} (Published nếu   │
│       vừa republish; Settled nếu replay resettle SFN)      │
│     + Preflight: outbox không còn pending orders cho       │
│       draw này (tránh race với phiên cũ).                  │
│   - StartExecution vào Resettle SFN.                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 3 — Resettle SFN (AWS Step Functions, 4 state)        │
│                                                             │
│  Input: { drawId }                                         │
│     │                                                      │
│     ▼                                                      │
│  PrepareResettle (1 Lambda)                                │
│     - Validate draw.status === Published (hoặc Settled     │
│       nếu replay — xem §7.2).                              │
│     - Preflight: aggregateBatchProgress(recentBatchKey)    │
│       → throw ConflictError nếu còn pending.               │
│     - Sinh resettleId = generateId() (UUIDv7).             │
│     - batchKey = "keno:resettle:${drawId}:${resettleId}".  │
│     - clearReversalSnapshot(drawId) — $unset reversal.     │
│     - snapshotReversalsForDraw(drawId, resettleId):        │
│         với entries { drawId, status:Settled || Scheduled, │
│                       payout.payoutAmount>0, payout.payoutTx}│
│         → $set reversal={reversalTx:UUID, reversalAmount:  │
│            payout.payoutAmount, resettleId}.               │
│         (entries Settled cũ HOẶC đã reset dở — đều được.)  │
│     - resetEntriesForResettle(drawId):                     │
│         với entries { drawId, status:Settled }             │
│         → $set status:Scheduled, $unset payout, outcome,   │
│            result, hasCappablePrize.                       │
│     - KHÔNG đụng draw.result (đã được republish ở Bước 1). │
│     - (Replay safe: nếu PrepareResettle đã chạy, entries   │
│        đã reset Scheduled, snapshotReversalsForDraw         │
│        idempotent do filter { reversal: {$exists:false} }.)│
│     - Trả về { drawId, resettleId, batchKey }.             │
│     │                                                      │
│     ▼                                                      │
│  EnqueueReversals (Lambda loop, chunk 500)                 │
│     - Cursor qua entries có reversal.reversalTx ASC.       │
│     - buildReversalOrder với batchKey + sequence=0.        │
│     - bulkEnqueue (unique tx tự skip duplicate).           │
│     - done=true khi hết → StartSettleExecution.            │
│     │                                                      │
│     ▼                                                      │
│  StartSettleExecution (Task: states:startExecution.sync:2) │
│     - ARN của Settle SFN cùng game.                        │
│     - Input: { drawId, resettleContext:{resettleId,        │
│                                         batchKey} }        │
│     - Settle SFN chạy NGUYÊN BẢN:                          │
│         PrepareSettle (đọc draw Published, result mới)     │
│         → SettleEntries (entries Scheduled → Settled)      │
│         → ApplyPayoutCaps                                  │
│         → CalculateFinancials (overwrite draw.financial)   │
│         → SyncTicketSummaries                              │
│         → BuildSettleReport (overwrite reports)            │
│         → PublishSettleDaily + PublishPlayerDaily          │
│         → FinalizeSettle (Published → Settling → Settled)  │
│         → EnqueueDispatchPayouts                           │
│             * Đọc resettleContext → batchKey resettle,     │
│               sequence=1, description "…(resettle)".       │
│     - End:true khi Settle SFN complete.                    │
└─────────────────────────────────────────────────────────────┘

Worker-tenant-dispatch dispatch orders theo $lookup blockingPrev:
  reversal (sequence=0) TẤT CẢ dispatched → payout mới (sequence=1).
```

---

## 3. Quy tắc nghiệp vụ (từ user requirements)

| Rule | Chi tiết implementation |
|------|------------------------|
| **R-BO-1** Cho phép staff sửa kết quả KỲ ĐÃ SETTLED | `republishResultAfterSettled` accepts `status = Settled`. Transition về `Published`, clear snapshot settle. |
| **R-BO-2** KHÔNG resettle khi kỳ đã huỷ | `PrepareResettleUseCase` validate `draw.status !== Void && !== Voiding`. Endpoint `/resettle` + `PrepareResettle` đều check. |
| **R-BO-3** Chỉ trigger resettle SAU khi đã cập nhật kết quả | Tách 2 bước ở BO: `republish-result` và `resettle` là 2 action riêng. Precondition của `/resettle`: `draw.status === Published` (vừa republish) hoặc `Settled` (replay). |
| **R-DISPATCH-1** Chờ resettle đang chạy xong trước khi resettle mới | Preflight `aggregateBatchProgress(lastResettleBatchKey).pending === 0`. Kết hợp status gate ở draw. |
| **R-DISPATCH-2** Không trùng dispatch order qua nhiều lần resettle | Mỗi phiên có `resettleId` riêng → `batchKey` riêng. `reversal.reversalTx` + `payout.payoutTx` sinh mới per phiên. Unique `tx` ở outbox. Sequence blocking ở worker. |

---

## 4. Thay đổi entity schema (tối thiểu)

### 4.1. `packages/game-keno/src/entities/entry.ts`

Thêm interface `EntryReversal` và field `reversal?` cùng cấp với `payout`:

```ts
export interface EntryReversal {
  /**
   * UUIDv7 — idempotency key cho REVERSAL order trong outbox.
   * Sinh atomic ở PrepareResettle (snapshotReversalsForDraw).
   * Giữ nguyên sau khi reversal dispatched (audit). Overwrite khi
   * resettle phiên mới (clearReversalSnapshot + snapshot lại).
   */
  reversalTx: string;

  /**
   * Số tiền cần thu hồi = `payout.payoutAmount` TRƯỚC khi reset entry.
   * Builder `buildReversalOrder` dùng giá trị này.
   * Invariant: reversalTx != null ⇒ reversalAmount > 0.
   */
  reversalAmount: number;

  /**
   * Phiên resettle đã sinh reversal này. Debugging + tracing.
   * Trùng với batchKey suffix.
   */
  resettleId: string;
}
```

Thêm field `reversal?: EntryReversal` vào `TicketEntryDoc` **cùng cấp với
`payout`** (KHÔNG nested) — quan trọng vì `SettleEntries` ghi lại
`$set payout` sẽ không đụng `reversal`.

### 4.2. `DrawStatus` — không thêm status mới

Dùng flow có sẵn: `Settled → Published → Settling → Settled`. Chỉ bổ sung
1 transition trong `VALID_TRANSITIONS` của `KenoDrawRepository`:

```ts
[DrawStatus.Settled]: new Set([DrawStatus.Published, DrawStatus.Voiding]),
```

Lý do bỏ `DrawStatus.Resettling`: BO đọc tiến độ qua
`aggregateBatchProgress(batchKey)` đủ. Giảm 1 enum = giảm migration +
rule change trên 7 game.

### 4.3. `DrawDoc` — không thêm `DrawResettleInfo`

Audit trail đầy đủ ở `tenant_dispatch_orders` (batchKey prefix
`keno:resettle:*`). Query `COUNT DISTINCT sourceContext.resettleId WHERE
sourceContext.drawId = X` để biết số lần resettle đã chạy. Không cần
ghi metadata trên draw doc.

---

## 5. Repo methods mới

### 5.1. `KenoEntryRepository`

Methods mới (tất cả idempotent, filter-based):

1. **`snapshotReversalsForDraw(drawId, resettleId): Promise<number>`**
   - Cursor query entries match `{ drawId, status: EntryStatus.Settled,
     "payout.payoutAmount": { $gt: 0 }, "payout.payoutTx": { $exists: true },
     reversal: { $exists: false } }`.
   - Bulk `updateOne` per doc (cần sinh UUIDv7 per entry — aggregation
     pipeline update không làm được UUIDv7 per doc → bulkWrite):
     `$set: { reversal: { reversalTx: generateId(), reversalAmount:
     doc.payout.payoutAmount, resettleId } }`.
   - Filter `reversal: { $exists: false }` → replay an toàn.
   - Chunk 500/bulk để giới hạn payload.
   - Return: tổng số entries có reversal đã snapshot.

2. **`resetEntriesForResettle(drawId): Promise<number>`**
   - `updateMany` filter `{ drawId, status: EntryStatus.Settled }`.
   - Update: `$set: { status: EntryStatus.Scheduled, version: next,
     updatedAt: now }`, `$unset: { payout: "", outcome: "", result: "",
     hasCappablePrize: "" }`.
   - Replay: filter chỉ match Settled → entries đã reset không còn match,
     no-op.
   - Return: modifiedCount.

3. **`clearReversalSnapshot(drawId): Promise<number>`**
   - `updateMany` filter `{ drawId, reversal: { $exists: true } }`.
   - Update: `$unset: { reversal: "" }`, `$set: { version: next,
     updatedAt: now }`.
   - Gọi ở đầu `PrepareResettleUseCase` trước `snapshotReversalsForDraw`.
   - Không ảnh hưởng outbox (orders reversal phiên cũ đã insert).

4. **`getEntriesWithReversalForDispatch({drawId, afterTx?, limit}):
   Promise<ReversalEntryForDispatch[]>`**
   - Filter `{ drawId, "reversal.reversalTx": afterTx ? { $gt: afterTx }
     : { $exists: true } }`, sort `"reversal.reversalTx": 1`.
   - Projection: `_id, tenantId, accountId, username,
     entrySummary.ticketNo, reversal.reversalAmount, reversal.reversalTx`.

### 5.2. `KenoDrawRepository`

1. **`republishResultAfterSettled(drawId, result): Promise<DrawEntity|null>`**
   - `findOneAndUpdate` filter `{ drawId, status: DrawStatus.Settled }`.
   - Update:
     `$set: { status: DrawStatus.Published, result, updatedAt: now }`,
     `$unset: { financial: "", stats: "", settleSummary: "",
                settledAt: "" }`.
   - Transition hợp lệ cần thêm vào `VALID_TRANSITIONS`:
     `[DrawStatus.Settled]: new Set([DrawStatus.Published,
     DrawStatus.Voiding])`.
   - Return `null` nếu draw không ở Settled → BO hiển thị lỗi.

### 5.3. `DispatchOrderRepository` (packages/tenant-dispatch)

1. **`findRecentBatchKeyByDraw(gameId, drawId): Promise<string|null>`**
   - `findOne({ gameId, "sourceContext.drawId": drawId })`, sort
     `createdAt: -1`, projection `batchKey`.
   - Dùng ở preflight.

### 5.4. `ReversalEntryForDispatch` type

File `packages/game-keno-application/src/infras/repos/types/entry.types.ts`:

```ts
export interface ReversalEntryForDispatch {
  id: string;
  tenantId: string;
  accountId: string;
  username: string;
  ticketNo: string;
  reversalAmount: number;
  reversalTx: string;
}
```

---

## 6. Use cases mới

### 6.1. `PrepareResettleUseCase`

File: `packages/game-keno-application/src/use-cases/resettle/prepare-resettle.ts`

Input:
```ts
export interface PrepareResettleInput {
  drawId: string;
  startedBy: string;  // userId staff — audit log
}
```

Output:
```ts
export interface PrepareResettleOutput {
  drawId: string;
  resettleId: string;
  batchKey: string;
  reversalCount: number;  // số entries có reversal
  resetCount: number;      // số entries đã reset
}
```

Logic:
1. Load `draw = drawRepo.getDrawById(drawId)`.
2. Validate:
   - `draw != null` (NotFound).
   - `draw.status ∈ {Published, Settled}` — Published = vừa republish,
     Settled = replay SFN (mới bắt đầu lại sau crash giữa chừng).
   - NẾU `draw.status === Void || Voiding` → `BadRequestError` (R-BO-2).
3. Preflight guard:
   - `lastBatchKey = dispatchOrderRepo.findRecentBatchKeyByDraw("keno",
     drawId)`.
   - Nếu có `lastBatchKey` bắt đầu bằng `"keno:resettle:"`:
     - `progress = dispatchOrderRepo.aggregateBatchProgress(lastBatchKey)`.
     - Nếu `progress.pending > 0` → `ConflictError("Còn ${progress.pending}
       orders pending từ phiên resettle trước.")`.
4. Sinh `resettleId = generateId()`.
5. `batchKey = "keno:resettle:${drawId}:${resettleId}"`.
6. `entryRepo.clearReversalSnapshot(drawId)` — wipe phiên cũ.
7. `reversalCount = entryRepo.snapshotReversalsForDraw(drawId,
   resettleId)`.
8. `resetCount = entryRepo.resetEntriesForResettle(drawId)`.
9. Draw **không cần transition** ở step này — draw đã ở Published từ
   Bước 1 republish. Nếu replay và draw đang ở Settled → SFN replay phải
   đi qua republish lại trước (xem §7.2).
10. Trả `{ drawId, resettleId, batchKey, reversalCount, resetCount }`.

### 6.2. `EnqueueReversalsUseCase`

File: `packages/game-keno-application/src/use-cases/resettle/enqueue-reversals.ts`

Input:
```ts
export interface EnqueueReversalsInput {
  drawId: string;
  resettleId: string;
  batchKey: string;
}
```

Output giống `EnqueueDispatchPayoutsOutput` — có `done`, `enqueued`,
`duplicated`.

Logic (copy shape từ `EnqueueDispatchPayoutsUseCase`):
- Cursor qua `getEntriesWithReversalForDispatch({drawId, afterTx: cursor,
  limit: 500})`.
- `buildReversalOrder({ tx: e.reversalTx, amount: e.reversalAmount,
  tenantId, accountId, username, gameId: GameProduct.Keno,
  roundIds: [drawId], description: "Thu hồi Keno kỳ ${drawId} (resettle)",
  metadata: { entryId: e.id, ticketNo: e.ticketNo, reason:
  "payoutReversal" }, sourceId: e.id, sourceContext: { drawId,
  resettleId, kind: "reversal" }, batchKey, sequence: 0 })`.
- `enqueueDispatchOrders.run({ orders })` — idempotent qua unique tx.
- MAX_EXECUTION_MS = 10 phút — loop SFN nếu chưa done.

### 6.3. Barrel `use-cases/resettle/index.ts`

Export 2 use case + input/output types.

### 6.4. Package exports

`packages/game-keno-application/package.json`:
```json
"exports": {
  "./use-cases/resettle": { ... }
}
```

---

## 7. Tái sử dụng Settle pipeline (DRY core)

### 7.1. Thay đổi `SettleContext`

File: `packages/game-keno-application/src/use-cases/settle/types.ts`

```ts
export interface SettleContext {
  drawId: string;
  drawDate: Date;
  drawNo: number;
  financialDate: Date;
  result: { ... };
  config: { ... };
  /**
   * Có giá trị khi Settle SFN chạy NESTED bên trong Resettle SFN.
   * EnqueueDispatchPayouts đọc field này để dùng batchKey resettle +
   * sequence=1. undefined ở settle lần đầu → behavior cũ giữ nguyên.
   */
  resettleContext?: {
    resettleId: string;
    batchKey: string;
  };
}
```

### 7.2. `PrepareSettleUseCase` truyền context

Thêm input optional:

```ts
export interface PrepareSettleInput {
  drawId: string;
  resettleContext?: { resettleId: string; batchKey: string };
}
```

Cuối `execute`, propagate vào output:
```ts
return { ...ctx, resettleContext: input.resettleContext };
```

Validate precondition vẫn là `draw.status === Published` — đúng cho cả
2 flow (settle lần đầu và resettle), vì ở resettle draw đã được
republish về Published trước khi vào Resettle SFN.

### 7.3. `EnqueueDispatchPayoutsUseCase` đọc context

File: `packages/game-keno-application/src/use-cases/settle/enqueue-dispatch-payouts.ts`

```ts
export interface EnqueueDispatchPayoutsInput {
  drawId: string;
  resettleContext?: { resettleId: string; batchKey: string };
}

protected async execute(input: EnqueueDispatchPayoutsInput) {
  const { drawId, resettleContext } = input;
  const batchKey = resettleContext?.batchKey
    ?? `keno:settle:${drawId}:payout`;
  const sequence = resettleContext ? 1 : 0;
  const descSuffix = resettleContext ? " (resettle)" : "";
  const sourceCtx = {
    drawId,
    ...(resettleContext && { resettleId: resettleContext.resettleId }),
  };
  // ... cursor + bulk enqueue như cũ, chỉ đổi batchKey/sequence/desc/ctx.
}
```

**KHÔNG sửa** các use case khác (`SettleEntries`, `ApplyPayoutCaps`,
`CalculateFinancials`, `SyncTicketSummaries`, `BuildSettleReport`,
`PublishSettleDaily`, `PublishPlayerDaily`, `FinalizeSettle`) — chúng
đã idempotent (filter theo status hoặc overwrite).

### 7.4. Replay sau crash ở SettleEntries

Nếu Settle SFN replay và entries đã ở Settled (từ attempt trước), filter
của `SettleEntries` (status: Scheduled) sẽ no-op → OK.

`CalculateFinancials`/`BuildSettleReport` overwrite financial + report
→ OK.

`FinalizeSettle` transition `Settling → Settled`; nếu draw đã ở Settled
thì SFN không rollback (step này chỉ idempotent-safe khi
re-from-checkpoint). Chi tiết trong §9.

---

## 8. Step Functions design

### 8.1. Resettle SFN (mới)

File: `apps/worker-keno/src/step-functions/resettle.ts` +
`resettle.asl.json` (generate từ TS).

4 state:

```
PrepareResettle (Task Lambda)
  Retry: Lambda errors 3x exp 2s/30s. BadRequestError/ConflictError
    → End with error (no retry).
  Next: EnqueueReversalsLoop

EnqueueReversalsLoop (Choice)
  Next: done=true → StartSettleExecution
        done=false → EnqueueReversals (self-loop)

EnqueueReversals (Task Lambda)
  Input: { drawId, resettleId, batchKey }
  Output merge: { drawId, resettleId, batchKey, done, enqueued, dupe }
  Next: EnqueueReversalsLoop (quay lại Choice)

StartSettleExecution (Task arn:aws:states:::states:startExecution.sync:2)
  Parameters:
    StateMachineArn: ${KenoSettleStateMachineArn} (SSM param hoặc env)
    Input:
      drawId.$: $.drawId
      resettleContext:
        resettleId.$: $.resettleId
        batchKey.$: $.batchKey
  ResultPath: $.settleExecution
  Retry: SFN.ExecutionDoesNotExist, States.TaskFailed 2x exp 10s/120s
  End: true
```

**Quan trọng**: dùng `.sync:2` (không `.sync`) để có structured error JSON
thay vì escaped string → Resettle SFN có thể surface lỗi Settle SFN.

### 8.2. Settle SFN hiện tại (modify)

File: `apps/worker-keno/src/step-functions/settle.ts`

Chỉ sửa input spec của `PrepareSettle` và `EnqueueDispatchPayouts` —
nhận thêm `resettleContext` optional, propagate xuyên suốt chain qua
ResultPath.

Không thêm/bớt state. Không đổi ARN. Không đổi concurrency limit.

### 8.3. Serverless functions YML

`apps/worker-keno/src/functions/resettle.yml` — 2 function mới:

```yaml
kenoResettlePrepare:
  handler: src/handlers/resettle/prepare.handler
  timeout: 300
  reservedConcurrency: 1  # serialize resettle per game
  # iamRoleStatementsInherit: true

kenoResettleEnqueueReversals:
  handler: src/handlers/resettle/enqueue-reversals.handler
  timeout: 300
  # reservedConcurrency mặc định
```

Thêm cross-stack output: Settle SFN ARN (từ `serverless.yml`
`resources.Outputs`) để Resettle SFN reference.

### 8.4. Handler skeletons

**`apps/worker-keno/src/handlers/resettle/prepare.ts`**
```ts
export const handler = async (event: { drawId: string;
  startedBy?: string }) => {
  const uc = container.get(PrepareResettleUseCase);
  return uc.run({ drawId: event.drawId, startedBy: event.startedBy
    ?? "system" });
};
```

**`apps/worker-keno/src/handlers/resettle/enqueue-reversals.ts`**
```ts
export const handler = async (event: { drawId: string;
  resettleId: string; batchKey: string }) => {
  const uc = container.get(EnqueueReversalsUseCase);
  return uc.run(event);
};
```

KHÔNG tạo handler cho StartSettleExecution — đó là native SFN state,
không cần Lambda.

---

## 9. Backoffice API

### 9.1. `POST /api/keno/draws/{drawId}/republish-result`

File mới: `apps/backoffice/src/app/api/keno/draws/[drawId]/
republish-result/route.ts`.

Zod body:
```ts
const BodySchema = z.object({
  result: KenoResultSchema,  // reuse schema hiện có
  reason: z.string().min(5).max(500),  // audit
});
```

Handler:
1. Guard: auth middleware chỉ admin với role `resettle:republish`.
2. `drawRepo.republishResultAfterSettled(drawId, result)`.
3. Nếu return null → 409 Conflict.
4. Ghi audit log `type: "keno.republishResult", drawId, reason,
   oldResult, newResult, operatorId`.
5. Return `{ ok: true, draw }`.

Endpoint `/publish-result` cũ KHÔNG thay đổi (vẫn dùng cho
salesClosed → Published).

### 9.2. `POST /api/keno/draws/{drawId}/resettle`

File mới: `apps/backoffice/src/app/api/keno/draws/[drawId]/
resettle/route.ts`.

Zod body:
```ts
const BodySchema = z.object({
  reason: z.string().min(5).max(500),
});
```

Handler:
1. Guard: role `resettle:execute`.
2. Load draw: `draw.status` phải là `Published` (vừa republish). Nếu
   `Settled` → trả 409 "Chưa cập nhật kết quả mới". Nếu `Void*` → 422.
3. StartExecution Resettle SFN. Input: `{ drawId, startedBy: user.id }`.
4. Ghi audit `type: "keno.resettleStart", drawId, reason,
   executionArn, operatorId`.
5. Return `{ ok: true, executionArn }`.

### 9.3. UI BO — 2 nút riêng biệt

Trang chi tiết draw đã Settled hiển thị 2 khối:

**Khối "Cập nhật kết quả"**
- Form nhập numbers mới + reason.
- Submit → `/republish-result`.
- Sau khi OK, draw status chuyển Published → khối "Resettle" enable.

**Khối "Resettle"**
- Disabled khi `draw.status !== Published`.
- Hoặc disabled khi preflight `aggregateBatchProgress` trả về pending>0.
- Hiển thị cảnh báo: "Sẽ sinh N reversal + M payout mới, không thể undo."
- Submit → `/resettle`.
- Show progress bar polling `/api/tenant-dispatch/batch-progress
  ?batchKey=keno:resettle:${drawId}:${resettleId}`.

---

## 10. Migration / rollout

### 10.1. Thứ tự deploy (không downtime)

1. **Deploy package changes** — entity schema thêm field optional,
   không breaking. Repo method mới. Use case mới. Build artifact.
2. **Deploy worker-keno** — Settle SFN đã modify (backward compat,
   `resettleContext` optional). Resettle SFN mới đứng cạnh.
3. **Deploy backoffice API** — 2 endpoint mới; UI ẩn đằng sau feature
   flag `keno.resettle.enabled`.
4. **Enable feature flag per env** — dev → staging → prod.

### 10.2. Data migration

Không cần. `reversal` là optional field, entries cũ không có → OK.
`DrawStatus` không thêm giá trị mới → không migration collection.

### 10.3. Rollback plan

- Set feature flag `false` → BO ẩn nút. Orders đã enqueued vẫn dispatch
  bình thường.
- Nếu lỗi nghiêm trọng ở Resettle SFN: `aws stepfunctions stop-execution`
  tất cả execution đang chạy. Entries đã reset (Scheduled) cần rerun
  resettle lại — KHÔNG rollback về Settled vì payout đã reversed.

---

## 11. Test matrix

### 11.1. Unit (packages)

- `snapshotReversalsForDraw` — 0 winners / N winners / entries voided
  (không có reversal).
- `resetEntriesForResettle` — no-op khi status != Settled.
- `clearReversalSnapshot` — gọi trên entries không có reversal = 0 modified.
- `republishResultAfterSettled` — transition Settled → Published,
  reject nếu đang Void.
- `PrepareResettleUseCase`:
  * Happy path (draw Published, no pending orders).
  * ConflictError khi preflight pending > 0.
  * BadRequestError khi draw Void.
  * Replay idempotent (chạy 2 lần → same resettleId reusable KHÔNG,
    khác resettleId OK — lưu ý: resettleId sinh fresh mỗi call, không
    persist. Nếu SFN retry PrepareResettle sau crash → sinh resettleId
    mới → batchKey mới → reversal snapshot được ghi lại. Cần idempotency
    token ở API để tránh double-trigger — xem §12.1).
- `EnqueueReversalsUseCase` — replay dedup qua `afterTx` cursor.
- `EnqueueDispatchPayoutsUseCase` — batchKey/sequence khi có vs không
  có resettleContext.

### 11.2. Integration (worker-keno)

- SFN Resettle end-to-end với LocalStack: SFN mock invoke Settle SFN
  nested, verify entries final status = Settled, outbox orders có
  reversal (seq=0) + payout mới (seq=1) same batchKey.
- Crash mid-EnqueueReversals → rerun → no duplicate orders.
- Crash mid-Settle (nested) → rerun resettle từ đầu → entries re-reset,
  re-snapshot, re-enqueue → outbox duplicate `tx` bị unique index skip.

### 11.3. BO e2e (browser-use)

- Staff click "Cập nhật kết quả" trên draw Settled → form submit →
  status Published.
- Sau đó click "Resettle" → SFN execute → progress bar đầy đủ.
- Thử click "Resettle" khi status Settled (chưa republish) → nút
  disabled, hoặc API trả 409.

---

## 12. Edge cases & safeguards

### 12.1. Double-click trigger resettle

Risk: staff click 2 lần nhanh → 2 SFN execution → 2 `resettleId` →
2 batchKey → phiên sau overwrite snapshot phiên trước.

Mitigation:
- API `/resettle` ghi `Idempotency-Key` header (UUID client-side) vào
  audit log. Nếu cùng idempotency key trong 5 phút → return executionArn
  cũ.
- Hoặc đơn giản hơn: dùng `reservedConcurrency: 1` ở Lambda prepare +
  unique index trên `batchKey` ở `tenant_dispatch_orders` (đã có) → phiên
  sau nếu kịp ghi reversal với batchKey mới thì orders cũng không dup.
- **KHUYẾN NGHỊ**: Thêm lock document `keno_resettle_locks` với `drawId`
  làm `_id`, TTL 10 phút. API `/resettle` acquire lock trước
  StartExecution.

### 12.2. Entry Void xen giữa resettle

Nếu staff void 1 vé trong lúc resettle đang chạy:
- Void SFN filter entries status Settled/Scheduled → match.
- Nếu Void chạy SAU PrepareResettle + TRƯỚC Settle SFN complete:
  entry đã Scheduled → Void reset về Voided → Settle SFN bỏ qua
  (filter Scheduled only) → OK.
- Void enqueue refund order với `sourceContext.drawId` → batchKey
  "keno:void:*" riêng → không conflict reversal batch.

Kết luận: an toàn nhờ separation of concerns ở filter + batchKey.

### 12.3. Tenant từ chối reversal

`tenant_dispatch_orders.status = Failed` cho reversal order → nghiệp vụ
operator phải xử lý thủ công (gọi tenant API hoặc ghi nợ). Không rollback
draw về Settled cũ. Audit trail đầy đủ ở outbox.

### 12.4. Max 3 lần resettle?

Không hardcode giới hạn. Mỗi phiên resettleId mới → không conflict. Nếu
cần policy, thêm check `COUNT DISTINCT resettleId` > 3 → API trả 422.
Out of scope plan này.

---

## 13. Checklist implementation (theo thứ tự)

- [ ] M1 Entity & types
  - [ ] `entities/entry.ts` thêm `EntryReversal` + `reversal?` field.
  - [ ] `infras/repos/types/entry.types.ts` thêm `ReversalEntryForDispatch`.
  - [ ] Re-export qua `indexes/index.ts`.
- [ ] M2 Repo layer
  - [ ] `KenoEntryRepository`: 4 method mới.
  - [ ] `KenoDrawRepository`: `republishResultAfterSettled` + update
    `VALID_TRANSITIONS`.
  - [ ] `DispatchOrderRepository` (tenant-dispatch): `findRecentBatchKeyByDraw`.
- [ ] M3 Use case layer
  - [ ] `PrepareResettleUseCase`.
  - [ ] `EnqueueReversalsUseCase`.
  - [ ] Modify `PrepareSettleUseCase` + `EnqueueDispatchPayoutsUseCase`.
  - [ ] Modify `SettleContext` type.
  - [ ] Barrel + package.json exports.
- [ ] M4 Worker layer
  - [ ] `handlers/resettle/prepare.ts`.
  - [ ] `handlers/resettle/enqueue-reversals.ts`.
  - [ ] `step-functions/resettle.ts` + `resettle.asl.json`.
  - [ ] `functions/resettle.yml`.
  - [ ] Modify `step-functions/settle.ts` cho resettleContext.
  - [ ] Cross-stack output Settle SFN ARN.
- [ ] M5 Backoffice
  - [ ] `api/keno/draws/[drawId]/republish-result/route.ts`.
  - [ ] `api/keno/draws/[drawId]/resettle/route.ts`.
  - [ ] UI 2 nút + progress polling.
  - [ ] Feature flag `keno.resettle.enabled`.
- [ ] M6 Test + rollout
  - [ ] Unit test per package.
  - [ ] Integration test worker với LocalStack.
  - [ ] BO e2e happy path.
  - [ ] Deploy dev → staging → prod với flag.

---

## 14. Template cho 6 game còn lại

Sau khi Keno resettle ổn định, replicate cho
`bingo18 / lotto535 / max3d / max3dpro / mega645 / power655` theo đúng
plan này, chỉ đổi `gameId` và batchKey prefix. Không có game-specific
logic khác vì settle pipeline đã unified qua outbox migration giai đoạn 1.

