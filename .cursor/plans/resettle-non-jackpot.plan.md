---
name: ""
overview: ""
todos: []
isProject: false
---

# Resettle Plan 1 — Game Không Jackpot

> **Scope**: Keno, Bingo18, Max3D, Max3DPro
> **Kế thừa**: `keno_resettle.plan.md` (đã đầy đủ logic cho 1 game)
> **Bổ sung**: Generalize cho 4 game không jackpot, audit log, idempotency
> **Plan kế tiếp**: `resettle-jackpot.plan.md` (Lotto535, Mega645, Power655)

---

## 1. Mục tiêu & nguyên tắc

Resettle xảy ra khi staff phát hiện **kết quả quay sai** của kỳ đã `Settled`,
cần thu hồi tiền trả sai + trả lại theo kết quả đúng.

### Nguyên tắc thiết kế (đã chốt)

- **DRY tuyệt đối** — Resettle SFN chỉ làm "chuẩn bị dữ liệu" rồi gọi lại
  Settle SFN nguyên bản qua nested execution. Zero duplicate logic
  match/cap/financial/report/publish.
- **KISS tuyệt đối** — Chỉ 2 use case mới (`PrepareResettle`,
  `EnqueueReversals`), 2 Lambda mới, 4 SFN state mới per game.
- **Idempotent đa tầng** — atomic `updateMany` + unique `tx` outbox +
  preflight guard + sequence blocking trong worker-tenant-dispatch.
- **Resettle N lần an toàn** — `resettleId` UUIDv7 mỗi phiên, batchKey
  phân tách hoàn toàn, clear reversal snapshot trước phiên mới.
- **KHÔNG ảnh hưởng Settle SFN khi không có resettleContext** — Settle SFN
  giữ nguyên hành vi cho settle lần đầu.

### Game scope

| Game | gameId | batchKey prefix | Worker app |
|---|---|---|---|
| Keno | `keno` | `keno:resettle:*` | `worker-keno` |
| Bingo 18 | `bingo18` | `bingo18:resettle:*` | `worker-bingo18` |
| Max 3D | `max3d` | `max3d:resettle:*` | `worker-max3d` |
| Max 3D Pro | `max3dpro` | `max3dpro:resettle:*` | `worker-max3dpro` |

---

## 2. Flow tổng quan (3 bước nghiệp vụ tách biệt ở BO)

```
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 1 — Sửa kết quả (staff thao tác ở BO)                      │
│                                                                 │
│ POST /api/{game}/draws/{drawId}/republish-result                │
│   - Precondition: draw.status === Settled                       │
│   - Atomic: status Settled → Published                          │
│             result = newResult                                  │
│             $unset financial, stats, settleSummary, settledAt   │
│   - KHÔNG đụng entries. KHÔNG enqueue.                          │
│   - Idempotent qua status filter (chạy 2 lần OK).               │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 2 — Trigger Resettle (staff bấm nút riêng)                 │
│                                                                 │
│ POST /api/{game}/draws/{drawId}/resettle                        │
│   - Precondition (CHECK Ở BO API, fail-fast trước SFN):         │
│     + draw.status === Published (BẮT BUỘC — phải đã republish   │
│       kết quả mới ở Bước 1; không accept Settled vì rủi ro      │
│       chạy lại settle với kết quả CŨ chưa sửa).                 │
│     + Preflight: aggregateBatchProgress(lastBatchKey).pending=0 │
│       (phiên resettle trước, nếu có, đã hoàn tất dispatch).     │
│   - Acquire WorkerLock với lockKey = "{game}:resettle:{drawId}" │
│     (TTL 10 phút, qua @megawin/worker-core repo).               │
│   - StartExecution Resettle SFN.                                │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ BƯỚC 3 — Resettle SFN (4 state)                                 │
│                                                                 │
│  Input: { drawId, startedBy }                                   │
│     │                                                           │
│     ▼                                                           │
│  PrepareResettle (Lambda)                                       │
│     - Validate draw.status === Published (defense in depth).    │
│       Reject nếu Void/Voiding/Settled/Settling.                 │
│     - Sinh resettleId = UUIDv7.                                 │
│     - batchKey = "{game}:resettle:{drawId}:{resettleId}".       │
│     - clearReversalSnapshot(drawId).                            │
│     - snapshotReversalsForDraw(drawId, resettleId).             │
│     - resetEntriesForResettle(drawId).                          │
│     - Trả { drawId, resettleId, batchKey, reversalCount, ... }. │
│     │                                                           │
│     ▼                                                           │
│  EnqueueReversalsLoop (Choice + Lambda loop)                    │
│     - Cursor entries có reversal.reversalTx, chunk 500.         │
│     - buildReversalOrder + bulkEnqueue (idempotent qua tx).     │
│     - sequence=0 (block payout sequence=1).                     │
│     - Lặp đến done=true.                                        │
│     │                                                           │
│     ▼                                                           │
│  StartSettleExecution (Task: states:startExecution.sync:2)      │
│     - Settle SFN cùng game, input có resettleContext.           │
│     - Settle SFN chạy nguyên bản:                               │
│         PrepareSettle (đọc draw Published + result mới)         │
│         → SettleEntries (Scheduled → Settled)                   │
│         → ApplyPayoutCaps (Keno only)                           │
│         → CalculateFinancials (overwrite)                       │
│         → SyncTicketSummaries                                   │
│         → BuildSettleReport (overwrite)                         │
│         → PublishSettleDaily + PublishPlayerDaily               │
│         → FinalizeSettle (Settling → Settled)                   │
│         → EnqueueDispatchPayouts                                │
│             * Đọc resettleContext → batchKey resettle,          │
│               sequence=1, description "...(resettle)".          │
│     - End:true khi nested complete.                             │
└─────────────────────────────────────────────────────────────────┘

Worker-tenant-dispatch dispatch theo $lookup blockingPrev:
  reversal (sequence=0) TẤT CẢ Dispatched → payout (sequence=1).
```

---

## 3. Quy tắc nghiệp vụ

| Rule | Chi tiết |
|---|---|
| **R-BO-1** Cho phép sửa kết quả kỳ đã Settled | `republishResultAfterSettled` accept status=Settled, transition về Published, clear settle snapshot. |
| **R-BO-2** KHÔNG resettle khi kỳ Void | API `/resettle` + `PrepareResettleUseCase` reject nếu `status ∈ {Void, Voiding}`. |
| **R-BO-3** Chỉ trigger resettle khi đã republish | Tách 2 bước ở BO. Endpoint `/resettle` precondition `status === Published` (BẮT BUỘC — không accept `Settled` để tránh rủi ro chạy lại settle với kết quả cũ chưa sửa). Replay SFN sau crash mid-execution: SFN tự idempotent qua filter, không cần fallback từ `Settled`. |
| **R-DISPATCH-1** Chờ phiên resettle trước hoàn tất | Preflight `aggregateBatchProgress(lastBatchKey).pending === 0` ở **BO API** (fail-fast UX). Nếu tenant nào đó stuck/fail → ops xử lý thủ công ở outbox; không tự động rollback hoặc block business toàn cục cho các draw mới của tenant khác. |
| **R-DISPATCH-2** Không trùng dispatch order qua nhiều phiên | Mỗi phiên `resettleId` riêng → `batchKey` riêng. `reversal.reversalTx` + `payout.payoutTx` UUIDv7 mỗi phiên. Unique `tx` ở outbox. |
| **R-LOCK-1** Chống double-trigger | Tận dụng `WorkerLockRepository` từ `@megawin/worker-core` với `lockKey = "{game}:resettle:{drawId}"`, TTL 10 phút. BO API `/resettle` `tryAcquire` trước `StartExecution`; SFN `FinalizeSettle` (nested) gọi `finalizeAndRelease` khi xong. Nếu SFN crash → TTL tự release sau 10 phút (qua filter `expiresAt <= now` ở `tryAcquire` lần sau, không cần TTL index của MongoDB). |

---

## 4. Thay đổi entity schema (tối thiểu)

### 4.1. Entry — thêm `EntryReversal` per game

File: `packages/game-{game}/src/entities/entry.ts`

Thêm interface `EntryReversal` và field `reversal?: EntryReversal` **cùng cấp
với `payout`** (KHÔNG nested) — vì `SettleEntries` sẽ ghi lại `$set payout`,
nếu nest sẽ bị overwrite.

```typescript
/**
 * Snapshot REVERSAL transaction cho entry trong phiên resettle.
 *
 * Sinh ở `PrepareResettle` BEFORE entries reset về Scheduled.
 * Builder `buildReversalOrder` đọc snapshot này để enqueue order seq=0.
 * Giữ lại sau khi reversal dispatched (audit trail).
 * Overwrite khi resettle phiên mới (clear + snapshot lại).
 */
export interface EntryReversal {
  /**
   * UUIDv7 — idempotency key cho REVERSAL order trong outbox.
   * Sinh atomic ở `snapshotReversalsForDraw`.
   */
  reversalTx: string;

  /**
   * Số tiền cần thu hồi (VND) = `payout.payoutAmount` TRƯỚC khi reset entry.
   * Invariant: reversalTx != null ⇒ reversalAmount > 0.
   */
  reversalAmount: number;

  /**
   * Phiên resettle đã sinh reversal này. Trùng với batchKey suffix.
   * Dùng cho debug + tracing.
   */
  resettleId: string;
}
```

Cập nhật `TicketEntryDoc`:

```typescript
export interface TicketEntryDoc {
  // ... fields hiện có ...
  payout?: EntryPayout;
  reversal?: EntryReversal;  // ← MỚI, cùng cấp payout
}
```

### 4.2. DrawStatus — KHÔNG thêm status mới

Dùng flow có sẵn: `Settled → Published → Settling → Settled`.

Bổ sung 1 transition trong `VALID_TRANSITIONS` của `{Game}DrawRepository`:

```typescript
[DrawStatus.Settled]: new Set([
  DrawStatus.Published,  // ← MỚI: resettle path
  DrawStatus.Voiding,    // (đã có)
]),
```

**Lý do bỏ `DrawStatus.Resettling`**: BO đọc tiến độ qua
`aggregateBatchProgress(batchKey)` đủ. Giảm 1 enum = giảm migration + rule
change trên 7 game.

### 4.3. DrawDoc — KHÔNG thêm `DrawResettleInfo`

Audit trail đầy đủ ở:
- `tenant_dispatch_orders` (batchKey prefix `{game}:resettle:*`)
- `audit_logs` (operator + reason)

Query "số lần resettle đã chạy cho 1 draw":
```javascript
db.tenant_dispatch_orders.distinct(
  "sourceContext.resettleId",
  { gameId, "sourceContext.drawId": drawId }
).length
```

### 4.4. Resettle lock — KHÔNG tạo collection mới

Tận dụng `WorkerLockRepository` từ `@megawin/worker-core` (collection
`worker_locks`). Pattern lock generic này đã hỗ trợ:
- Atomic `tryAcquire` qua unique index trên `lockKey`.
- Crash recovery qua `expiresAt <= now` filter (không cần MongoDB TTL index).
- `finalizeAndRelease` trong 1 round-trip atomic.

Convention `lockKey` cho resettle:

```
{game}:resettle:{drawId}
```

Ví dụ: `"keno:resettle:2026-03-07.045"`.

TTL acquire: 600 giây (10 phút). Nếu Resettle SFN crash mid-execution →
invocation kế tiếp (cùng drawId) match qua `expiresAt <= now` → takeover.

`ownerToken` random per acquire (`crypto.randomUUID()`) → `FinalizeSettle`
nested phải biết token để release. Truyền qua `resettleContext`:

```typescript
resettleContext?: {
  resettleId: string;
  batchKey: string;
  /** WorkerLock ownerToken — FinalizeSettle gọi finalizeAndRelease với token này. */
  lockOwnerToken: string;
};
```

Không cần migration / index mới — `worker_locks` đã tồn tại trong production
phục vụ cho `worker-tenant-dispatch`.

---

## 5. Repo methods mới (per game)

> Tuân thủ `mongodb-repository-architecture.mdc`: file `*-repo.ts` CHỈ chứa
> class + query. Aggregate result types tách vào `repos/types/{concern}.types.ts`.
>
> **Tách file riêng cho resettle**: theo pattern `entry-void-repo.ts` (đã có
> trong codebase), tạo `entry-resettle-repo.ts` riêng — cùng dùng entries
> collection nhưng tách concerns. KHÔNG mix vào `entry-repo.ts` hiện có.

### 5.1. `{Game}EntryResettleRepository` (MỚI — file riêng)

File: `packages/game-{game}-application/src/infras/repos/entry-resettle-repo.ts`

```typescript
/**
 * Repository cho các thao tác RESETTLE-only trên entries collection.
 *
 * Tách riêng khỏi `EntryRepository` chính theo pattern `entry-void-repo.ts`:
 * - DRY hơn vì không inflate file entry-repo.ts (đã rất lớn).
 * - Concerns rõ ràng: settle/place-bet ở entry-repo, void ở entry-void-repo,
 *   resettle ở entry-resettle-repo.
 * - Cùng dùng collection `{game}_entries` (qua `BaseRepo` collName chung).
 *
 * 4 method bên dưới chỉ active trong Resettle SFN flow.
 */
export class {Game}EntryResettleRepository extends {Game}BaseRepo<TicketEntryDoc> {
  constructor() {
    super({ collName: {Game}Collections.Entries, dataMapper: ... });
  }

  // 4 method bên dưới ↓
}
```

#### Method 1: `snapshotReversalsForDraw(drawId, resettleId): Promise<number>`

```typescript
/**
 * Snapshot REVERSAL transaction cho mọi entries có payout > 0 thuộc draw.
 *
 * Idempotent qua filter `reversal: { $exists: false }` — replay an toàn.
 * Bulk write per doc (vì cần UUIDv7 per entry — aggregation pipeline update
 * không sinh được UUIDv7 per doc).
 *
 * Filter:
 *   { drawId, status: EntryStatus.Settled,
 *     "payout.payoutAmount": { $gt: 0 },
 *     "payout.payoutTx": { $exists: true },
 *     reversal: { $exists: false } }
 *
 * Update per doc:
 *   $set: { reversal: { reversalTx: generateId(),
 *                       reversalAmount: doc.payout.payoutAmount,
 *                       resettleId },
 *           updatedAt: now }
 *
 * Chunk 500 entries/bulkWrite để giới hạn payload.
 *
 * Index: { drawId: 1, status: 1, "payout.payoutAmount": 1 }
 */
async snapshotReversalsForDraw(
  drawId: string,
  resettleId: string,
): Promise<number>
```

#### Method 2: `resetEntriesForResettle(drawId): Promise<number>`

```typescript
/**
 * Reset entries Settled về Scheduled để Settle SFN replay.
 *
 * Idempotent qua status filter — entries đã reset không còn match.
 *
 * Filter: { drawId, status: EntryStatus.Settled }
 * Update:
 *   $set: { status: EntryStatus.Scheduled, version: next, updatedAt: now }
 *   $unset: { payout: "", outcome: "", result: "",
 *             hasCappablePrize: "" }  // Keno only
 *
 * KHÔNG đụng `reversal` (đã snapshot ở step trước).
 */
async resetEntriesForResettle(drawId: string): Promise<number>
```

> **Lưu ý per-game**: Field `$unset` khác nhau:
> - **Keno**: `payout, outcome, result, hasCappablePrize`
> - **Bingo18**: `payout, outcome, result`
> - **Max3D / Max3DPro**: `payout, outcome, result`

#### Method 3: `clearReversalSnapshot(drawId): Promise<number>`

```typescript
/**
 * Wipe reversal snapshot phiên cũ để PrepareResettle phiên mới ghi lại.
 *
 * Filter: { drawId, reversal: { $exists: true } }
 * Update:
 *   $unset: { reversal: "" }
 *   $set: { version: next, updatedAt: now }
 *
 * Idempotent — không có doc match thì 0 modified, OK.
 * KHÔNG ảnh hưởng outbox (orders reversal phiên cũ đã insert).
 */
async clearReversalSnapshot(drawId: string): Promise<number>
```

#### Method 4: `getEntriesWithReversalForDispatch(params): Promise<ReversalEntryForDispatch[]>`

```typescript
/**
 * Cursor query entries có reversal cho EnqueueReversals.
 *
 * Filter:
 *   { drawId,
 *     "reversal.reversalTx": afterTx
 *       ? { $gt: afterTx }
 *       : { $exists: true } }
 *
 * Sort: { "reversal.reversalTx": 1 }
 * Projection: id, tenantId, accountId, username,
 *             entrySummary.ticketNo, reversal
 * Limit: chunk size (500).
 *
 * Index: { drawId: 1, "reversal.reversalTx": 1 }
 */
async getEntriesWithReversalForDispatch(params: {
  drawId: string;
  afterTx?: string;
  limit: number;
}): Promise<ReversalEntryForDispatch[]>
```

### 5.2. `{Game}DrawRepository`

#### Method: `republishResultAfterSettled(drawId, result): Promise<DrawDoc | null>`

```typescript
/**
 * Atomic transition Settled → Published khi staff sửa kết quả sai.
 *
 * `findOneAndUpdate` filter `{ drawId, status: DrawStatus.Settled }`.
 * Update:
 *   $set: { status: DrawStatus.Published, result, updatedAt: now }
 *   $unset: { financial: "", stats: "", settleSummary: "", settledAt: "" }
 *
 * Return null nếu draw không ở Settled → BO hiển thị 409 Conflict.
 *
 * Yêu cầu: `VALID_TRANSITIONS[Settled]` phải include `Published`.
 */
async republishResultAfterSettled(
  drawId: string,
  result: DrawResult,
): Promise<DrawDoc | null>
```

### 5.3. Lock — KHÔNG cần repo riêng

Tận dụng `WorkerLockRepository` từ `@megawin/worker-core`. Import trực tiếp
ở `TriggerResettleUseCase` (BO) và `FinalizeSettleUseCase` (worker):

```typescript
import { WorkerLockRepository } from "@megawin/worker-core";

// Trong TriggerResettleUseCase:
const lockRepo = new WorkerLockRepository();
const ownerToken = crypto.randomUUID();
const acquired = await lockRepo.tryAcquire({
  lockKey: `${gameId}:resettle:${drawId}`,
  ownerToken,
  ttlSeconds: 600,
});
if (!acquired) {
  throw AppException.conflict("Phiên resettle khác đang chạy cho draw này.");
}
// → truyền ownerToken vào SFN input qua resettleContext.lockOwnerToken.

// Trong FinalizeSettleUseCase (chỉ resettle path):
if (input.resettleContext) {
  await lockRepo.finalizeAndRelease(
    `${gameId}:resettle:${input.drawId}`,
    input.resettleContext.lockOwnerToken,
    {},  // không update lastSuccessAt/lastError vì đó là worker lifecycle metric
  );
}
```

### 5.4. `DispatchOrderRepository` (packages/tenant-dispatch)

#### Method: `findRecentBatchKeyByDraw(gameId, drawId): Promise<string | null>`

```typescript
/**
 * Tìm batchKey gần nhất cho 1 draw — dùng ở preflight PrepareResettle.
 *
 * Filter: { gameId, "sourceContext.drawId": drawId }
 * Sort: { createdAt: -1 }
 * Projection: { batchKey: 1 }
 * Limit: 1
 *
 * Index: { gameId: 1, "sourceContext.drawId": 1, createdAt: -1 }
 */
async findRecentBatchKeyByDraw(
  gameId: string,
  drawId: string,
): Promise<string | null>
```

### 5.5. Aggregate result types

File: `packages/game-{game}-application/src/infras/repos/types/entry.types.ts`

```typescript
/**
 * Entry projection cho EnqueueReversals — minimum fields builder cần.
 */
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

Re-export qua `repos/types/index.ts` và `repos/index.ts`.

---

## 6. Use cases mới (per game)

> Tuân thủ `mongodb-repository-architecture.mdc`: use case **KHÔNG** chứa
> MongoDB query trực tiếp. Tất cả I/O qua repo method.

### 6.1. `PrepareResettleUseCase`

File: `packages/game-{game}-application/src/use-cases/resettle/prepare-resettle.ts`

```typescript
export interface PrepareResettleInput {
  drawId: string;
  /** Operator userId — audit log. */
  startedBy: string;
}

export interface PrepareResettleOutput {
  drawId: string;
  resettleId: string;
  batchKey: string;
  /** Số entries có reversal đã snapshot. */
  reversalCount: number;
  /** Số entries đã reset Settled → Scheduled. */
  resetCount: number;
}

/**
 * Step 1 của Resettle SFN — chuẩn bị data trước khi enqueue reversals.
 *
 * IDEMPOTENT: chạy lại OK do filter-based update.
 * Replay sau crash: clearReversalSnapshot wipe phiên dở, snapshot lại.
 *
 * KHÔNG kiểm tra preflight `aggregateBatchProgress` ở đây — đã được BO API
 * `/resettle` check fail-fast trước khi `StartExecution`. SFN trust BO.
 */
export class PrepareResettleUseCase
  extends InternalUseCase<PrepareResettleInput, PrepareResettleOutput>
{
  private readonly drawRepo = new {Game}DrawRepository();
  private readonly entryResettleRepo = new {Game}EntryResettleRepository();

  protected async execute(input: PrepareResettleInput) {
    const { drawId } = input;

    // ── 1. Validate draw status — defense in depth ──────────────
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) throw AppException.notFound(`Draw ${drawId} không tồn tại.`);

    // R-BO-3: BẮT BUỘC status === Published. BO API đã check, đây là defense.
    // KHÔNG accept Settled — staff PHẢI republish kết quả mới ở Bước 1 trước.
    // Replay SFN sau crash: PrepareResettle idempotent qua filter, không cần
    // fallback từ Settled → Published nữa.
    if (draw.status !== DrawStatus.Published) {
      throw AppException.badRequest(
        `Draw ${drawId} status = "${draw.status}", expected Published. ` +
        `Phải republish kết quả mới (Bước 1) trước khi resettle.`);
    }

    // ── 2. Sinh resettleId + batchKey ────────────────────────────
    const resettleId = generateId();
    const batchKey = `${GAME_ID}:resettle:${drawId}:${resettleId}`;

    // ── 3. Wipe reversal snapshot phiên cũ ───────────────────────
    await this.entryResettleRepo.clearReversalSnapshot(drawId);

    // ── 4. Snapshot reversal cho phiên mới ───────────────────────
    // Filter status: Settled — entries đã reset từ replay không có reversal cũ.
    const reversalCount = await this.entryResettleRepo
      .snapshotReversalsForDraw(drawId, resettleId);

    // ── 5. Reset entries Settled → Scheduled ─────────────────────
    const resetCount = await this.entryResettleRepo.resetEntriesForResettle(drawId);

    return { drawId, resettleId, batchKey, reversalCount, resetCount };
  }
}
```

### 6.2. `EnqueueReversalsUseCase`

File: `packages/game-{game}-application/src/use-cases/resettle/enqueue-reversals.ts`

```typescript
export interface EnqueueReversalsInput {
  drawId: string;
  resettleId: string;
  batchKey: string;
  /** Cursor — tx của entry cuối cùng đã enqueue ở Lambda invoke trước. */
  afterTx?: string;
}

export interface EnqueueReversalsOutput {
  done: boolean;
  enqueued: number;
  duplicated: number;
  /** Cursor cho Lambda invoke tiếp theo. */
  nextAfterTx?: string;
}

/**
 * Step 2 của Resettle SFN — enqueue REVERSAL orders với sequence=0.
 *
 * Loop self-invoke qua SFN Choice state cho đến done=true.
 * Idempotent qua unique `tx` ở dispatch_orders collection.
 *
 * MAX_EXECUTION_MS = 10 phút (Lambda timeout = 15 phút).
 */
export class EnqueueReversalsUseCase
  extends InternalUseCase<EnqueueReversalsInput, EnqueueReversalsOutput>
{
  // Pattern copy từ EnqueueDispatchPayoutsUseCase, đổi:
  //   - cursor field: reversal.reversalTx (thay payout.payoutTx)
  //   - amount: reversal.reversalAmount (thay payout.payoutAmount)
  //   - builder: buildReversalOrder (thay buildPayoutOrder)
  //   - sequence: 0 (thay 1)
  //   - description: "Thu hồi {Game} kỳ {drawId} (resettle)"
  //   - kind metadata: "payoutReversal"
}
```

### 6.3. Barrel `use-cases/resettle/index.ts`

```typescript
export { PrepareResettleUseCase } from "./prepare-resettle";
export type { PrepareResettleInput, PrepareResettleOutput } from "./prepare-resettle";
export { EnqueueReversalsUseCase } from "./enqueue-reversals";
export type { EnqueueReversalsInput, EnqueueReversalsOutput } from "./enqueue-reversals";
```

### 6.4. Package exports

`packages/game-{game}-application/package.json`:

```json
{
  "exports": {
    "./use-cases/resettle": {
      "import": { "types": "./dist/use-cases/resettle/index.d.ts",
                  "default": "./dist/use-cases/resettle/index.js" },
      "require": { "types": "./dist/use-cases/resettle/index.d.cts",
                   "default": "./dist/use-cases/resettle/index.cjs" }
    }
  }
}
```

---

## 7. Tái sử dụng Settle pipeline (DRY core)

### 7.1. Thay đổi `SettleContext`

File: `packages/game-{game}-application/src/use-cases/settle/types.ts`

Thêm field optional `resettleContext`:

```typescript
export interface SettleContext {
  drawId: string;
  drawDate: string;
  drawNo: number;
  financialDate: string;
  result: { ... };
  config: { ... };
  financials?: SettleFinancials;

  /**
   * Có giá trị khi Settle SFN chạy NESTED bên trong Resettle SFN.
   *
   * EnqueueDispatchPayouts đọc field này để dùng:
   *   - batchKey resettle (thay vì batchKey settle)
   *   - sequence=1 (block bởi reversal sequence=0)
   *   - description suffix " (resettle)"
   *
   * FinalizeSettle đọc `lockOwnerToken` để release WorkerLock.
   *
   * undefined ở settle lần đầu → behavior cũ giữ nguyên hoàn toàn.
   */
  resettleContext?: {
    resettleId: string;
    batchKey: string;
    /** Token để FinalizeSettle release WorkerLock — sinh khi BO API tryAcquire. */
    lockOwnerToken: string;
  };
}
```

### 7.2. `PrepareSettleUseCase` propagate context

```typescript
export interface PrepareSettleInput {
  drawId: string;
  resettleContext?: {
    resettleId: string;
    batchKey: string;
    lockOwnerToken: string;
  };
}

protected async execute(input: PrepareSettleInput): Promise<SettleContext> {
  // ... logic load draw + config như cũ ...

  return {
    drawId,
    // ... fields cũ ...
    resettleContext: input.resettleContext,
  };
}
```

**Quan trọng**: validate precondition vẫn là `draw.status === Settling` (sau
khi Lambda PrepareSettle chuyển từ Published → Settling như bình thường).
Resettle path: `PrepareResettle` đảm bảo draw đã ở `Published` trước khi
StartSettleExecution → Settle SFN khởi động bình thường.

### 7.3. `EnqueueDispatchPayoutsUseCase` đọc context

File: `packages/game-{game}-application/src/use-cases/settle/enqueue-dispatch-payouts.ts`

```typescript
export interface EnqueueDispatchPayoutsInput {
  drawId: string;
  afterTx?: string;
  resettleContext?: {
    resettleId: string;
    batchKey: string;
    lockOwnerToken: string;
  };
}

protected async execute(input: EnqueueDispatchPayoutsInput) {
  const { drawId, resettleContext } = input;

  const batchKey = resettleContext?.batchKey
    ?? `${GAME_ID}:settle:${drawId}:payout`;
  const sequence = resettleContext ? 1 : 0;
  const descSuffix = resettleContext ? " (resettle)" : "";
  const sourceCtx = {
    drawId,
    ...(resettleContext && { resettleId: resettleContext.resettleId }),
  };

  // ... cursor + bulk enqueue như cũ, chỉ đổi 4 fields trên ...
}
```

### 7.4. `FinalizeSettleUseCase` release lock (chỉ resettle path)

```typescript
import { WorkerLockRepository } from "@megawin/worker-core";

protected async execute(input: SettleContextWithFinancials) {
  // ... existing logic transition Settling → Settled ...

  // Release WorkerLock nếu chạy resettle path. No-op cho settle lần đầu.
  if (input.resettleContext) {
    const lockRepo = new WorkerLockRepository();
    await lockRepo.finalizeAndRelease(
      `${GAME_ID}:resettle:${input.drawId}`,
      input.resettleContext.lockOwnerToken,
      {},  // không update lastSuccessAt/lastError — đó là worker lifecycle metric
    );
  }
}
```

### 7.5. Use cases KHÔNG cần sửa

`SettleEntries`, `ApplyPayoutCaps` (Keno), `CalculateFinancials`,
`SyncTicketSummaries`, `BuildSettleReport`, `PublishSettleDaily`,
`PublishPlayerDaily` — đã idempotent (filter theo status hoặc upsert overwrite).

### 7.6. Replay safety

| Crash điểm | Hành vi replay | OK? |
|---|---|---|
| Sau PrepareResettle (entries reset, reversals snapshot) | clearReversalSnapshot wipe → snapshot lại với resettleId mới. Reversal cũ trong outbox vẫn dispatch (idempotent). Draw vẫn ở `Published`. | ✅ |
| Mid EnqueueReversals | Cursor `afterTx` resume. Unique tx skip duplicate. | ✅ |
| Mid Settle SFN nested | Settle SFN có replay safety sẵn (filter status, upsert reports). | ✅ |
| Sau FinalizeSettle nhưng trước outbox dispatch | Outbox tự dispatch theo blockingPrev. SFN End. Lock đã release. | ✅ |
| Lock TTL expired (SFN crash quá 10 phút) | Staff trigger lại → `tryAcquire` match qua `expiresAt <= now` → takeover. PrepareResettle replay an toàn. | ✅ |

---

## 8. Step Functions design

### 8.1. Resettle SFN (mới per game)

File: `apps/worker-{game}/src/step-functions/resettle.ts` (TypeScript builder).

```
PrepareResettle (Task Lambda)
  Retry: Lambda errors 3x exp 2s/30s.
         BadRequest/NotFound → End với error (no retry — staff fix trạng thái).
  Next:  EnqueueReversalsLoop

EnqueueReversalsLoop (Choice)
  done === true  → StartSettleExecution
  done === false → EnqueueReversals

EnqueueReversals (Task Lambda)
  Input:  { drawId, resettleId, batchKey, afterTx }
  Output: { drawId, resettleId, batchKey, done, enqueued,
            duplicated, nextAfterTx }
  Next:   EnqueueReversalsLoop (self-loop)

StartSettleExecution (Task: states:startExecution.sync:2)
  Parameters:
    StateMachineArn: ${SettleStateMachineArn}  // SSM hoặc env
    Input:
      drawId.$: $.drawId
      resettleContext:
        resettleId.$: $.resettleId
        batchKey.$:   $.batchKey
  ResultPath: $.settleExecution
  Retry: SFN.ExecutionDoesNotExist, States.TaskFailed
         2x exp 10s/120s
  End: true
```

**Quan trọng**:
- Dùng `.sync:2` (không `.sync`) → structured error JSON thay vì escaped
  string → Resettle SFN có thể surface lỗi từ Settle SFN.
- Cross-stack output: Settle SFN ARN export từ `serverless.yml` Resources.Outputs
  để Resettle SFN reference.

### 8.2. Settle SFN hiện tại (modify minimal)

File: `apps/worker-{game}/src/step-functions/settle.ts`

**Chỉ sửa input/output spec** của `PrepareSettle` và `EnqueueDispatchPayouts`:
- `PrepareSettle` nhận thêm `resettleContext` optional → propagate vào ctx.
- `EnqueueDispatchPayouts` đọc `ctx.resettleContext` từ input.

**KHÔNG**:
- Thêm/bớt state.
- Đổi ARN.
- Đổi concurrency.

### 8.3. Lambda handlers mới

File: `apps/worker-{game}/src/handlers/resettle/prepare.ts`

```typescript
import { PrepareResettleUseCase, type PrepareResettleInput }
  from "@megawin/game-{game}-application/use-cases/resettle";

const useCase = new PrepareResettleUseCase();

export async function handler(event: PrepareResettleInput) {
  return useCase.run(event);
}
```

File: `apps/worker-{game}/src/handlers/resettle/enqueue-reversals.ts`

```typescript
import { EnqueueReversalsUseCase, type EnqueueReversalsInput }
  from "@megawin/game-{game}-application/use-cases/resettle";

const useCase = new EnqueueReversalsUseCase();

export async function handler(event: EnqueueReversalsInput) {
  return useCase.run(event);
}
```

KHÔNG tạo handler cho `StartSettleExecution` — đó là native SFN state.

### 8.4. Serverless function YAML

```yaml
# apps/worker-{game}/src/functions/resettle.yml
{game}ResettlePrepare:
  handler: src/handlers/resettle/prepare.handler
  timeout: 300
  reservedConcurrency: 1   # serialize prepare per game

{game}ResettleEnqueueReversals:
  handler: src/handlers/resettle/enqueue-reversals.handler
  timeout: 600             # 10 phút (matches MAX_EXECUTION_MS)
```

---

## 9. Backoffice API + UI

> Tuân thủ `frontend-dev.mdc`: dùng `withApi()` builder, validate Zod schema,
> form dùng react-hook-form + Zod + react-query, dialog header có icon
> gradient, KPI horizontal layout.

### 9.1. API: Republish result

File: `apps/backoffice/src/app/api/{game}/draws/[drawId]/republish-result/route.ts`

```typescript
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { RepublishResultUseCase }
  from "@megawin/game-{game}-application/use-cases/draws";
import { republishResultSchema } from "./_lib/schema";

const useCase = new RepublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Admin, CompanyRole.Staff] })
  .body(republishResultSchema)
  .handler(async ({ body, params, user }) => {
    return useCase.run({
      drawId: params.drawId,
      result: body.result,
      reason: body.reason,
      operatorId: user.id,
    });
  });
```

File: `_lib/schema.ts`

```typescript
import { z } from "zod";

export const republishResultSchema = z.object({
  result: KenoResultSchema,                    // reuse schema hiện có
  reason: z.string().min(5).max(500),
});
```

### 9.2. API: Trigger Resettle

File: `apps/backoffice/src/app/api/{game}/draws/[drawId]/resettle/route.ts`

```typescript
import { withApi } from "@/lib/api";
import { TriggerResettleUseCase }
  from "@megawin/game-{game}-application/use-cases/draws";
import { triggerResettleSchema } from "./_lib/schema";

const useCase = new TriggerResettleUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Admin, CompanyRole.Staff] })
  .body(triggerResettleSchema)
  .handler(async ({ body, params, user }) => {
    return useCase.run({
      drawId: params.drawId,
      reason: body.reason,
      operatorId: user.id,
    }, { successStatus: 202 });
  });
```

`TriggerResettleUseCase` logic (theo thứ tự, fail-fast):

1. **Validate status** — Load draw, reject nếu `status !== Published`
   (chưa republish hoặc Settled/Voiding/Void). 409 Conflict.
2. **Preflight phiên trước** — `findRecentBatchKeyByDraw` + nếu là batch
   resettle thì `aggregateBatchProgress(lastBatchKey).pending === 0`.
   Nếu pending > 0 → 409 Conflict với chi tiết "Còn N orders pending từ phiên trước".
3. **Acquire WorkerLock** — `lockKey = "{game}:resettle:{drawId}"`,
   `ownerToken = randomUUID()`, TTL 600s. Nếu fail → 409 Conflict
   "Phiên resettle khác đang chạy".
4. **StartExecution Resettle SFN** — input:
   ```typescript
   {
     drawId,
     startedBy: user.id,
     // Truyền vào nested Settle SFN qua resettleContext
     lockOwnerToken: ownerToken,
   }
   ```
   Nếu `StartExecution` throw → release lock manual + bubble error.
5. **Return** `{ executionArn }` cho UI poll progress.

> **Quan trọng**: 4 step này PHẢI fail-fast theo thứ tự trên. Lock chỉ acquire
> SAU khi 2 validation đầu pass, để tránh chiếm lock rồi bại lộ ngay sau đó.

### 9.3. UI: Trang chi tiết draw đã Settled

Trang `/games/{game}/draws/[drawId]/page.tsx` — section "Resettle"
hiển thị 2 khối khi `draw.status ∈ {Settled, Published}`.

#### 9.3.1. Khối "Cập nhật kết quả"

```
┌─ Cập nhật kết quả (Cards với gap-0 py-0, icon SYSTEM_ICON_GRADIENT) ─┐
│ Form react-hook-form + Zod:                                          │
│   - Numbers input theo schema game                                   │
│   - Reason textarea (min 5 ký tự)                                    │
│   - Submit button (mutation.isPending)                               │
│                                                                      │
│ Disabled khi draw.status !== Settled                                 │
│ Mutation onSuccess → invalidate draw query → status thành Published  │
└──────────────────────────────────────────────────────────────────────┘
```

#### 9.3.2. Khối "Resettle"

```
┌─ Resettle (Card với icon warning gradient) ────────────────────────┐
│ Disabled khi:                                                       │
│   - draw.status !== Published                                       │
│   - HOẶC preflight aggregateBatchProgress(lastBatchKey).pending > 0│
│     (UI tự fetch preflight để hiển thị disabled state, nhưng       │
│      backend validate lại — UI chỉ là UX hint)                     │
│                                                                     │
│ Cảnh báo: "Sẽ sinh N reversal + M payout mới, không thể undo."     │
│                                                                     │
│ Form react-hook-form + Zod:                                         │
│   - Reason textarea (min 5 ký tự)                                   │
│   - Submit button                                                   │
│                                                                     │
│ Mutation onSuccess → polling progress qua                           │
│   GET /api/tenant-dispatch/batch-progress?batchKey=...             │
│ Render progress bar với reversal + payout sequence.                │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.4. Query keys

File: `apps/backoffice/src/lib/query-keys/{game}.ts`

```typescript
export const {game}Keys = {
  all: [MODULE] as const,
  draws: [MODULE, "draws"] as const,
  drawDetail: (drawId: string) =>
    [MODULE, "draws", { drawId }] as const,
  resettleProgress: (batchKey: string) =>
    [MODULE, "resettle", "progress", { batchKey }] as const,
};
```

### 9.5. Query hooks

File: `apps/backoffice/src/app/(main)/games/{game}/draws/[drawId]/_lib/queries.ts`

```typescript
export function useDrawDetail(drawId: string) {
  return useQuery({
    queryKey: {game}Keys.drawDetail(drawId),
    queryFn: () => apiClient.get(`/{game}/draws/${drawId}`),
  });
}

export function useResettleProgress(batchKey: string | null) {
  return useQuery({
    queryKey: batchKey ? {game}Keys.resettleProgress(batchKey) : ["__noop"],
    queryFn: () => apiClient.get(
      `/tenant-dispatch/batch-progress?batchKey=${batchKey}`),
    enabled: !!batchKey,
    refetchInterval: (q) =>
      q.state.data?.pending > 0 ? 2000 : false,
  });
}
```

---

## 10. Audit logging

> **Bỏ section này khỏi scope plan**. Sẽ làm 1 chức năng audit log riêng,
> tích hợp xuyên hệ thống — không tích hợp ad-hoc trong từng feature.

---

## 11. Migration / rollout

### 11.1. Thứ tự deploy (no downtime)

1. **Deploy package changes** — entity schema thêm `reversal?` optional,
   không breaking. Repo method mới (`entry-resettle-repo.ts` riêng).
   Use case mới. Build artifact.
2. **Deploy worker-{game}** — Settle SFN modified (backward compat,
   `resettleContext` optional). Resettle SFN mới đứng cạnh.
3. **Deploy backoffice API + UI** — 2 endpoint mới; UI ẩn đằng sau
   feature flag `{game}.resettle.enabled`.
4. **Enable feature flag per env** — dev → staging → prod.

### 11.2. Data migration

Không cần. `reversal` là optional field, entries cũ không có → OK.
DrawStatus không thêm value mới → không migration collection.

`worker_locks` collection đã tồn tại trong production (dùng cho
`worker-tenant-dispatch`). KHÔNG cần tạo mới hay tạo thêm index nào —
unique `lockKey` index đã có sẵn.

### 11.3. Rollback plan

- **Feature flag false** → BO ẩn 2 nút. Orders đã enqueued vẫn dispatch
  bình thường (worker không phụ thuộc flag).
- **Lỗi nghiêm trọng Resettle SFN**: `aws stepfunctions stop-execution`
  → entries đã reset Scheduled cần rerun resettle, **KHÔNG rollback**
  về Settled vì payout đã reversed. Lock TTL tự release sau 10 phút.
- **Lỗi data corruption**: restore từ daily backup → re-run resettle.

---

## 12. Edge cases & safeguards

### 12.1. Double-click trigger resettle

**Mitigation 1 — WorkerLock**:
- BO API `/resettle` `tryAcquire` `lockKey = "{game}:resettle:{drawId}"`
  TTL 600s.
- Nếu fail (lock đã có chủ + chưa expire) → return 409 Conflict.
- Lock TTL 10 phút auto-release qua filter `expiresAt <= now` ở
  `tryAcquire` lần sau (không cần TTL index của MongoDB).
- `FinalizeSettle` (nested cuối Settle SFN) gọi `finalizeAndRelease`
  khi có `resettleContext` để release sớm.

**Mitigation 2 — Idempotency-Key header (optional, nice-to-have)**:
- API `/resettle` accept header `Idempotency-Key` (UUID client).
- Cache executionArn trong Redis 5 phút key = `idempKey`.
- Cùng key trong window → return executionArn cũ.

### 12.2. Entry void xen giữa resettle

Nếu staff void 1 vé trong lúc resettle đang chạy:
- Void SFN filter entries `status ∈ {Settled, Scheduled}` → match.
- Nếu void chạy SAU PrepareResettle + TRƯỚC Settle SFN nested complete:
  entry đã Scheduled → Void reset về Voided → Settle SFN bỏ qua
  (filter Scheduled only) → OK.
- Void enqueue refund với `batchKey "{game}:void:*"` → không conflict.

Kết luận: an toàn nhờ separation qua filter + batchKey.

### 12.3. Tenant từ chối reversal/payout

`tenant_dispatch_orders.status = Failed` cho reversal hoặc payout order:
- Operator phải xử lý thủ công (gọi tenant API hoặc ghi nợ).
- KHÔNG rollback draw về Settled cũ.
- KHÔNG block business toàn cục — chỉ tenant đó bị ảnh hưởng. Các draw
  mới của tenant khác vẫn dispatch bình thường (orders per tenant độc lập).
- Audit trail đầy đủ ở outbox + ops dashboard.

### 12.4. Concurrency limit

- `{game}ResettlePrepare` Lambda `reservedConcurrency: 1` per game →
  serialize prepare cross-draw cho 1 game.
- `EnqueueReversals` không cần limit (cursor + idempotent).
- StartSettleExecution sync — chỉ 1 nested SFN active per resettle.

### 12.5. Max số lần resettle 1 draw?

Không hardcode. Mỗi phiên `resettleId` mới → không conflict.

Nếu cần policy:
```javascript
// Pre-check ở API /resettle:
const count = db.tenant_dispatch_orders.distinct(
  "sourceContext.resettleId",
  { gameId, "sourceContext.drawId": drawId }
).length;
if (count >= 3) throw 422;
```

---

## 13. Test matrix

### 13.1. Unit (packages)

- `snapshotReversalsForDraw` — 0 winners / N winners / entries voided.
- `resetEntriesForResettle` — no-op khi status != Settled.
- `clearReversalSnapshot` — entries không có reversal = 0 modified.
- `republishResultAfterSettled` — transition Settled → Published,
  reject Voiding/Void.
- `PrepareResettleUseCase`:
  * Happy path (status === Published).
  * BadRequestError khi draw status !== Published (Settled / Voiding / Void / Settling).
  * Replay idempotent (chạy 2 lần → resettleId mới, batchKey mới,
    snapshot/reset OK).
- `TriggerResettleUseCase` (BO API):
  * Reject khi status !== Published → 409.
  * Reject khi preflight pending > 0 → 409.
  * Reject khi WorkerLock đã có chủ → 409.
  * Happy path → StartExecution + return executionArn.
- `EnqueueReversalsUseCase` — replay dedup qua `afterTx` cursor.
- `EnqueueDispatchPayoutsUseCase` — batchKey/sequence khi có vs không
  có resettleContext.
- `FinalizeSettleUseCase` — release WorkerLock chỉ khi có resettleContext.

### 13.2. Integration (worker-{game})

- SFN Resettle end-to-end với LocalStack: nested Settle SFN, verify
  entries final = Settled, outbox có reversal (seq=0) + payout (seq=1)
  cùng batchKey.
- Crash mid EnqueueReversals → rerun → no duplicate orders.
- Crash mid Settle nested → rerun resettle → re-reset, re-snapshot,
  re-enqueue → outbox unique tx skip duplicate.

### 13.3. BO e2e (browser-use)

- Click "Cập nhật kết quả" trên draw Settled → form submit → status
  Published.
- Sau đó click "Resettle" → SFN execute → progress bar đầy đủ.
- Click "Resettle" khi status Settled (chưa republish) → nút disabled.
- Click "Resettle" 2 lần liên tiếp → request thứ 2 nhận 409.

---

## 14. Checklist implementation (theo thứ tự, per game)

Lặp lại cho mỗi game: `keno → bingo18 → max3d → max3dpro`.

### M1. Entity & types

- [ ] `entities/entry.ts`: thêm `EntryReversal` + `reversal?` field.
- [ ] `entities/index.ts`: re-export.
- [ ] **KHÔNG** tạo `ResettleLockDoc` — dùng `WorkerLockEntity` từ `@megawin/worker-core`.

### M2. Repo layer

- [ ] `infras/repos/types/entry.types.ts`: `ReversalEntryForDispatch`.
- [ ] `infras/repos/entry-resettle-repo.ts` **(MỚI, file riêng)**: 4 method
  resettle (`snapshotReversalsForDraw`, `resetEntriesForResettle`,
  `clearReversalSnapshot`, `getEntriesWithReversalForDispatch`). KHÔNG
  mix vào `entry-repo.ts` hiện có — pattern theo `entry-void-repo.ts`.
- [ ] `DrawRepository`: `republishResultAfterSettled` + `VALID_TRANSITIONS`.
- [ ] `DispatchOrderRepository` (tenant-dispatch): `findRecentBatchKeyByDraw`.
- [ ] Re-export qua `repos/types/index.ts` + `repos/index.ts`.
- [ ] **KHÔNG** tạo `ResettleLockRepository` — dùng `WorkerLockRepository` từ `@megawin/worker-core`.

### M3. Use case layer

- [ ] `use-cases/resettle/prepare-resettle.ts`.
- [ ] `use-cases/resettle/enqueue-reversals.ts`.
- [ ] `use-cases/resettle/index.ts` barrel.
- [ ] Modify `PrepareSettleUseCase` (input + output propagate).
- [ ] Modify `EnqueueDispatchPayoutsUseCase` (read context).
- [ ] Modify `FinalizeSettleUseCase` (release lock).
- [ ] Modify `SettleContext` type.
- [ ] `package.json` exports thêm `./use-cases/resettle`.

### M4. Worker layer

- [ ] `handlers/resettle/prepare.ts`.
- [ ] `handlers/resettle/enqueue-reversals.ts`.
- [ ] `step-functions/resettle.ts`.
- [ ] `functions/resettle.yml`.
- [ ] Modify `step-functions/settle.ts` propagate `resettleContext`.
- [ ] Cross-stack output Settle SFN ARN.

### M5. Backoffice

- [ ] `RepublishResultUseCase` + `TriggerResettleUseCase` ở
  `game-{game}-application/use-cases/draws`. `TriggerResettleUseCase`:
  validate status === Published → preflight pending === 0 → tryAcquire
  WorkerLock → StartExecution.
- [ ] API route `/republish-result/route.ts` + `_lib/schema.ts`.
- [ ] API route `/resettle/route.ts` + `_lib/schema.ts`.
- [ ] Query keys `lib/query-keys/{game}.ts`.
- [ ] Query hooks `_lib/queries.ts`.
- [ ] UI 2 khối form theo frontend-dev rules.
- [ ] Feature flag `{game}.resettle.enabled`.

### M6. Migration MongoDB

- [ ] Index `{ drawId: 1, "reversal.reversalTx": 1 }` trên entries.
- [ ] Index `{ gameId: 1, "sourceContext.drawId": 1, createdAt: -1 }`
  trên dispatch_orders.
- [ ] **KHÔNG** cần tạo collection / index cho lock — `worker_locks` đã
  có sẵn từ `worker-tenant-dispatch`.

### M7. Test + rollout

- [ ] Unit test per package.
- [ ] Integration test worker với LocalStack.
- [ ] BO e2e happy path + edge cases.
- [ ] Deploy dev → staging → prod với flag.

---

## 15. Game-specific notes (4 game không jackpot)

### 15.1. Keno

- `resetEntriesForResettle` `$unset` thêm `hasCappablePrize` (do payout caps).
- `ApplyPayoutCaps` step trong Settle SFN giữ nguyên — chạy lại OK
  (overwrite cappedPrize).

### 15.2. Bingo18

- Settle SFN có `BuildSettleReport` + `PublishSettleDaily` đã idempotent.
- KHÔNG có `apply-payout-caps`.

### 15.3. Max3D / Max3DPro

- Cả 2 game pattern giống nhau, chỉ khác config prizes.
- Reuse template Keno → đổi `gameId` + `$unset` field theo entry shape
  từng game.

---

## 16. Plan kế tiếp

Sau khi 4 game không jackpot ổn định production ≥ 2 tuần:
- Implement `resettle-jackpot.plan.md` cho Lotto535, Mega645, Power655.
- Plan jackpot kế thừa toàn bộ Plan 1 này, **bổ sung** DBA workflow ở
  MongoDB Compass / Studio 3T cho jackpot cycle restoration.