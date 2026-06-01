# Bingo 18 — Plan triển khai chức năng Resettle

> **Phạm vi**: full-stack (Backend use-cases + Worker SFN + BO API + BO UI). Tất cả open questions đã được user confirm — plan ready-to-implement.
> **Nguồn tham chiếu**: `.cursor/plans/keno-resettle.plan.md` (Keno đã ship). Plan này mirror Keno, lược bỏ phần jackpot + payout caps (Bingo 18 không có).
> **Nguyên tắc**: KISS, copy-adapt từ Keno cho domain riêng Bingo 18. KHÔNG extract types lên `game-core` — `ResettleContext` + `EntryReversal` sống cùng game.

**Confirmation từ user (đã chốt):**
1. ✅ Bingo 18 có `vietlottRef` → endpoint + dialog riêng như Keno.
2. ✅ Schema `numbers` validate dùng chung 1 cách (copy từ `publishResultSchema` hiện tại).
3. ✅ Tenant dispatch dùng giống Keno — Bingo 18 chỉ ghi outbox, worker tenant-dispatch tự xử lý.
4. ✅ `settledAt` chưa có → thêm vào cả `DrawDoc` entity và `DrawSelectorItem` DTO.

---

## 1. Quyết định thiết kế chuẩn (đã chốt với user)

| # | Quyết định | Lý do |
|---|---|---|
| 1 | `ResettleContext` định nghĩa **trong** `packages/game-bingo18-application/src/use-cases/settle/types.ts` | Là field nội bộ của `SettleContext` Bingo 18; pipeline settle khác từng game, không có cross-game consumer. |
| 2 | `EntryReversal` định nghĩa **trong** `packages/game-bingo18/src/entities/entry.ts` | Embedded trong `TicketEntryDoc` của collection `bingo18TicketEntries`; schema entity sống cùng entity. |
| 3 | `BusinessLockCoordinator` reuse **trực tiếp** từ `packages/worker-core` | Đã có sẵn cross-process lock, không cần extract gì thêm. |
| 4 | `buildPayoutOrder`, `buildReversalOrder`, `EnqueueDispatchOrdersUseCase` reuse từ `packages/tenant-dispatch` | Có sẵn, generic theo `gameId`. |
| 5 | Tách `publishResult` hiện tại của Bingo 18 thành **3 endpoints** riêng: `publish-result` (chỉ initial), `republish-result` (sau settled), `vietlott-ref` (chỉ metadata) | Single Responsibility — sửa `vietlottRef` không kéo resettle. Đồng nhất với Keno. |
| 6 | KHÔNG thêm status mới `Resettling`. Tái dùng `Published → Settling → Settled` | Resettle = workflow đặc biệt dùng lại Settle pipeline; thêm status mới sẽ nhân đôi mọi nhánh code. |
| 7 | `resettleId` (UUIDv7) sinh tại **BO API** (`TriggerResettleUseCase`), propagate qua SFN input | Đảm bảo retry/replay dùng cùng `resettleId` → idempotent snapshot. Sinh ở Lambda → mỗi crash + retry ra ID khác → corrupt data. |
| 8 | Lock key convention: `"bingo18:resettle:{drawId}"`, TTL 300s | Đồng nhất pattern Keno (`"keno:resettle:{drawId}"`). |
| 9 | Resettle SFN nest **Settle SFN** qua `startExecution.sync:2` (không copy-paste settle steps) | DRY — settle pipeline đã đầy đủ, chỉ cần propagate `resettleContext` để 2 step (`EnqueueDispatchPayouts`, `FinalizeSettle`) đổi behavior. |
| 10 | `EnqueueReversals` chạy **1 lần duy nhất** tới khi hết entries (cursor 500/batch trong cùng invocation), KHÔNG self-loop qua SFN Choice | Lambda timeout 900s đủ cho ~5K reversals; SFN ASL gọn; idempotent qua outbox unique `tx`. |
| 11 | KHÔNG có app-level time cap (`MAX_EXECUTION_MS`) ở `EnqueueReversals` | Use case chỉ làm Mongo bulk insert, không gọi HTTP tenant. SFN/Lambda timeout là defense layer. |
| 12 | Repository `EntryResettleRepository` **tách riêng** khỏi `EntryRepository` | Concern khác nhau — entry-repo lo settle/void/aggregate, resettle-repo lo snapshot reversal + reset entries. |
| 13 | KHÔNG bump `version` ở `bulkSetReversal`, `resetEntriesForResettle`, `clearReversalSnapshot` | Đây là phase trung gian, không phải business state có ý nghĩa với tenant. Bump version → tenant feed nhận event "vé thắng → quay về chưa quay" → flicker. Re-settle ở `bulkSettleEntries` mới bump (đúng 1 lần per phiên resettle). |
| 14 | Repository mappers fail-fast: `reversalTx`, `reversalAmount` thiếu/invalid → throw, không default `null`/`0` | Tránh data corruption silent. |
| 15 | `settledAt` là **high-water mark**: `FinalizeSettle` set, `republishResultAfterSettled` KHÔNG unset | UI/API dùng `result.publishedAt > settledAt` để phân biệt resettle vs initial settle. |
| 16 | `FinalizeSettle` (resettle path) **KHÔNG** clear `reversal` field | Giữ lại làm audit trail của phiên resettle gần nhất. Phiên kế tiếp tự overwrite (winners) hoặc wipe (non-winners) qua `PrepareResettle` step 1. |
| 17 | Execution name SFN deterministic theo `(drawId, settledAt)` — KHÔNG dùng `resettleId` | AWS giữ name unique 90 ngày → retry cùng phiên trả execution hiện tại thay vì throw `ExecutionAlreadyExists`. `settledAt` chỉ đổi khi `FinalizeSettle` ghi → 2 phiên resettle có 2 names khác nhau. |

---

## 2. Flow tổng quan (3 bước nghiệp vụ)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Bước 1: Sửa kết quả                                                 │
│   POST /api/bingo18/draws/{drawId}/republish-result                 │
│   Body: { numbers: number[3] }                                      │
│   Use case: RepublishResultUseCase                                  │
│   Side effects:                                                     │
│     - draw.status: Settled → Published                              │
│     - $unset financial, stats, settleSummary                        │
│     - GIỮ settledAt, vietlottRef                                    │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ Bước 2: Trigger resettle                                            │
│   POST /api/bingo18/draws/{drawId}/resettle                         │
│   Use case: TriggerResettleUseCase                                  │
│   Side effects:                                                     │
│     - sinh resettleId (UUIDv7)                                      │
│     - acquire lock "bingo18:resettle:{drawId}" TTL 300s             │
│     - draw.status: Published → Settling                             │
│     - StartExecution Resettle SFN                                   │
│       (name = `${toExecutionName(drawId)}-resettle-${settledAt}`)   │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ Bước 3: Resettle SFN (worker-bingo18)                               │
│                                                                      │
│   PrepareResettle (Lambda Task)                                     │
│     - validate draw.status = Settling                               │
│     - clearReversalSnapshot (wipe reversal phiên cũ)                │
│     - cursor-loop: bulkSetReversal cho entries có payoutAmount > 0  │
│     - resetEntriesForResettle (Settled → Scheduled)                 │
│     ↓                                                                │
│   EnqueueReversals (Lambda Task, 1 invocation chạy hết)             │
│     - cursor-paginate entries có reversal                           │
│     - buildReversalOrder + bulk insert outbox                       │
│     ↓                                                                │
│   StartSettleExecution (Task .sync:2 → nested Bingo18 Settle SFN)   │
│     Input: { drawId, resettleContext: { resettleId, lockOwnerToken }}│
│     Settle SFN chạy bình thường, 2 step adapt theo resettleContext: │
│       - EnqueueDispatchPayouts: batchKey resettle, suffix " (resettle)"│
│       - FinalizeSettle: release business lock                       │
│     ↓                                                                │
│   ResettleSucceeded                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Quy tắc nghiệp vụ — Bảng quyết định

### 3.1 Chuyển trạng thái draw

| Tình huống | `status` trước | `status` sau | Ai làm |
|---|---|---|---|
| Sửa kết quả lần đầu (chưa settle) | `SalesClosed` / `Published` | `Published` | `PublishResultUseCase` (giữ nguyên) |
| Sửa kết quả sau settle | `Settled` | `Published` | `RepublishResultUseCase` (mới) |
| Sửa `vietlottRef` | `Published` / `Settling` / `Settled` | (giữ nguyên) | `UpdateVietlottRefUseCase` (mới) |
| Trigger settle lần đầu | `Published` | `Settling` | `TriggerSettleUseCase` (giữ nguyên) |
| Trigger resettle | `Published` | `Settling` | `TriggerResettleUseCase` (mới) |
| Finalize settle | `Settling` | `Settled` | `FinalizeSettleUseCase` (cập nhật để release lock) |

### 3.2 Khi nào hiện nút "Kết sổ lại"

```ts
// shouldShowResettle
return draw.status === DrawStatus.Published
  && draw.settledAt != null
  && draw.result?.publishedAt
  && new Date(draw.result.publishedAt).getTime() > new Date(draw.settledAt).getTime();
```

### 3.3 Reversal candidates filter

`payout.payoutAmount > 0` (entries thắng đã credit cho tenant). Entries thua (`payoutAmount = 0`) không cần reversal — `resetEntriesForResettle` reset chung.

### 3.4 Idempotency đa tầng

| Tầng | Cơ chế |
|---|---|
| BO API double-click | `BusinessLockCoordinator.acquire` — 1 thắng, 1 fail HTTP 409 |
| `triggerResettle` retry | Filter `status: Published`; lần retry sau status đã `Settling` → skip transition |
| SFN StartExecution retry | Name deterministic `(drawId, settledAt)` → AWS trả execution hiện tại |
| `PrepareResettle` replay | `clearReversalSnapshot` wipe trước, `bulkSetReversal` filter `status: Settled` |
| `EnqueueReversals` replay | Outbox unique index `tx` reject duplicate |
| `EnqueueDispatchPayouts` replay (resettle path) | Outbox unique index `tx`, batchKey riêng theo `resettleId` |

---

## 4. Thay đổi entity schema

### 4.1 `packages/game-bingo18/src/entities/entry.ts`

**Thêm interface mới `EntryReversal`** (copy-adapt từ Keno, JSDoc đầy đủ):

```ts
/**
 * Snapshot reversal — chỉ tồn tại khi entry đã đi qua ÍT NHẤT 1 phiên resettle.
 *
 * (JSDoc đầy đủ — copy nguyên từ Keno, đổi "Keno" → "Bingo 18")
 */
export interface EntryReversal {
  /** UUIDv7 — idempotency key cho reversal dispatch transaction. */
  reversalTx: string;
  /** Số tiền debit ngược (VND) — copy từ payout.payoutAmount cũ. */
  reversalAmount: number;
  /** UUIDv7 phiên resettle — propagate từ TriggerResettle. */
  resettleId: string;
}
```

**Cập nhật `TicketEntryDoc`** — thêm field `reversal?: EntryReversal` (sau `payout?`):

```ts
export interface TicketEntryDoc {
  // ...
  payout?: EntryPayout;
  /**
   * Snapshot reversal — semantic kép (dispatch payload vs audit snapshot).
   * Xem JSDoc EntryReversal.
   */
  reversal?: EntryReversal;
  // ...
}
```

**Cập nhật `EntryPayout.payoutTx`** JSDoc — thêm note "Lifecycle resettle" giống Keno (note giá trị cũ đã được record trong `tenant_dispatch_orders`).

### 4.2 `packages/game-bingo18/src/entities/draw.ts`

**BẮT BUỘC thêm field `settledAt?: Date`** vào `DrawDoc` (interface). Runtime đã được `settleComplete` set qua `$set: { settledAt: now }` (xem `draw-repo.ts:settleComplete`), nay khai báo chính thức trong type:

```ts
export interface DrawDoc {
  // ...
  /**
   * Thời điểm hoàn tất kết sổ (set bởi FinalizeSettle qua `settleComplete`).
   * High-water mark — KHÔNG bị unset bởi republishResultAfterSettled.
   * UI/API dùng so sánh với result.publishedAt để biết có republish mới hay chưa.
   */
  settledAt?: Date;
}
```

Đây là decision đã chốt với user — không phải optional verify.

### 4.3 Cập nhật `EntryMapper` (nếu có dedicated mapper)

`packages/game-bingo18-application/src/infras/mappers/entry-mapper.ts` (hoặc `repos/mappers/`):
- Thêm `reversal` vào `toEntity`/`toDocument` mapping.
- Fail-fast: nếu doc có `reversal` nhưng thiếu `reversalTx` hoặc `reversalAmount` không phải number → `throw new Error("EntryMapper: reversal field corrupt for entry ${id}")`.

### 4.4 Cập nhật `DrawMapper`

Thêm `settledAt` mapping (nếu mapper hiện tại có check field whitelist). Nếu mapper dùng `_.pick` hay tương tự, thêm field này.

---

## 5. Repository methods mới

### 5.1 `packages/game-bingo18-application/src/infras/repos/draw-repo.ts`

#### 5.1.1 Method `republishResultAfterSettled`

```ts
/**
 * Sửa kết quả của draw đã settled — bước 1 của Resettle workflow.
 *
 * Filter strict status=Settled (atomic, idempotent: lần 2 gọi trả null).
 * $set: status: Published, result, updatedAt.
 * $unset: financial, stats, settleSummary (data settle cũ).
 * GIỮ: settledAt (high-water mark), vietlottRef (metadata).
 */
async republishResultAfterSettled(
  drawId: string,
  result: DrawResult,
): Promise<DrawEntity | null> {
  return await this.findOneAndUpdate(
    { drawId, status: DrawStatus.Settled },
    {
      $set: {
        status: DrawStatus.Published,
        result,
        updatedAt: new Date(),
      },
      $unset: {
        financial: "",
        stats: "",
        settleSummary: "",
      },
    },
    { returnDocument: "after" },
  );
}
```

#### 5.1.2 Method `updateVietlottRef`

```ts
/**
 * Cập nhật CHỈ vietlottRef — KHÔNG kéo resettle.
 * Filter: status ∈ { Published, Settling, Settled }.
 * Idempotent.
 */
async updateVietlottRef(
  drawId: string,
  vietlottRef: DrawDoc["vietlottRef"],
): Promise<boolean> {
  const result = await this.updateOne(
    {
      drawId,
      status: { $in: [DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled] },
    },
    { $set: { vietlottRef, updatedAt: new Date() } },
  );
  return result.modifiedCount > 0;
}
```

#### 5.1.3 Refactor `publishResult` hiện tại

Thu hẹp filter về `status: SalesClosed` only (hoặc `salesClosed | published` nếu vẫn cho phép re-publish lần đầu khi chưa settle — quyết định dựa trên Keno: Keno hiện cho cả `salesClosed | published`. Bingo 18 hiện cũng đã cho `salesClosed | published`. **Giữ nguyên** — staff có thể publish nhiều lần khi chưa settle).

→ **Không refactor signature `publishResult` hiện tại**. Chỉ thêm 2 methods mới `republishResultAfterSettled` + `updateVietlottRef`.

### 5.2 Tạo file mới `packages/game-bingo18-application/src/infras/repos/entry-resettle-repo.ts`

Copy 100% structure từ Keno, thay:
- Import `KenoCollections` → `Bingo18Collections`.
- Import `EntryReversal, TicketEntryEntity` từ `@megawin/game-bingo18/entities`.
- `resetEntriesForResettle` `$unset` list **KHÔNG có** `hasCappablePrize` (Bingo 18 không có field này):

```ts
$unset: {
  payout: "",
  outcome: "",
  result: "",
  // KHÔNG có hasCappablePrize — Bingo 18 không có payout caps.
}
```

5 methods cần có (giống Keno):
1. `listCandidatesForReversal({ drawId, afterId, limit })` → `ReversalCandidate[]`
2. `bulkSetReversal(items)` → `number`
3. `resetEntriesForResettle(drawId)` → `number`
4. `getEntriesWithReversalForDispatch({ drawId, afterTx, limit })` → `ReversalEntryForDispatch[]`
5. `clearReversalSnapshot(drawId)` → `{ modifiedCount: number }`

### 5.3 Tạo file types `packages/game-bingo18-application/src/infras/repos/types/entry.types.ts`

(Nếu chưa có folder types — tạo mới mirror Keno):

```ts
export interface ReversalCandidate {
  id: string;
  payoutAmount: number;
}

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

### 5.4 Cập nhật barrel `packages/game-bingo18-application/src/infras/repos/index.ts`

```ts
export { EntryResettleRepository } from "./entry-resettle-repo";
```

---

## 6. Use Cases — BO API (3 file mới + 1 file existing giữ nguyên)

Tất cả ở `packages/game-bingo18-application/src/use-cases/draws/`.

### 6.1 `republish-result.ts` (mới)

```ts
import { v7 as uuidv7 } from "uuid";
import type { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawResult } from "@megawin/game-bingo18/entities";

export class RepublishResultUseCase {
  constructor(private readonly drawRepo: DrawRepository) {}

  async execute(input: { drawId: string; numbers: number[] }) {
    const result: DrawResult = {
      numbers: input.numbers,
      publishedAt: new Date(),
    };
    const updated = await this.drawRepo.republishResultAfterSettled(input.drawId, result);
    if (!updated) {
      throw new Error(`Draw ${input.drawId} not found or not in Settled status`);
    }
    return { drawId: updated.drawId, result: updated.result };
  }
}
```

### 6.2 `update-vietlott-ref.ts` (mới)

```ts
import type { DrawRepository } from "../../infras/repos/draw-repo";

export class UpdateVietlottRefUseCase {
  constructor(private readonly drawRepo: DrawRepository) {}

  async execute(input: {
    drawId: string;
    drawPeriod: string;
    drawDate: string;
  }) {
    const ok = await this.drawRepo.updateVietlottRef(input.drawId, {
      drawPeriod: input.drawPeriod,
      drawDate: input.drawDate,
    });
    if (!ok) {
      throw new Error(`Draw ${input.drawId} not found or status không cho phép sửa vietlottRef`);
    }
    return { drawId: input.drawId };
  }
}
```

### 6.3 `trigger-resettle.ts` (mới — copy-adapt từ Keno)

```ts
import { v7 as uuidv7 } from "uuid";
import { BusinessLockCoordinator } from "@megawin/worker-core/use-cases";
import type { DrawRepository } from "../../infras/repos/draw-repo";
import type { SfnClient } from "@megawin/shared/aws"; // hoặc path SfnClient của project

const RESETTLE_LOCK_TTL_SECONDS = 300;

/**
 * Trigger Resettle — bước 2 của workflow.
 *
 * 1) Acquire BusinessLock "bingo18:resettle:{drawId}" TTL 300s
 * 2) Sinh resettleId UUIDv7
 * 3) draw.status: Published → Settling
 * 4) StartExecution Bingo 18 Resettle SFN với deterministic name
 *    `${toExecutionName(drawId)}-resettle-${settledAt.toISOString()}`
 *
 * Crash anywhere → next call → re-acquire same lock token → idempotent
 * (status đã Settling thì transition skip, SFN name trùng → AWS trả execution hiện tại).
 */
export class TriggerResettleUseCase {
  constructor(
    private readonly drawRepo: DrawRepository,
    private readonly lockCoordinator: BusinessLockCoordinator,
    private readonly sfnClient: SfnClient,
    private readonly stateMachineArn: string,
  ) {}

  async execute(input: { drawId: string }) {
    const lockKey = `bingo18:resettle:${input.drawId}`;

    const acquisition = await this.lockCoordinator.acquire({
      key: lockKey,
      ttlSeconds: RESETTLE_LOCK_TTL_SECONDS,
    });
    if (!acquisition) {
      throw new ConflictError(`Resettle for draw ${input.drawId} đang chạy`);
    }

    try {
      const drawBefore = await this.drawRepo.findByDrawId(input.drawId);
      if (!drawBefore) throw new Error(`Draw ${input.drawId} not found`);
      if (!drawBefore.settledAt) {
        throw new Error("Draw chưa từng settled — không thể resettle");
      }
      if (drawBefore.status !== DrawStatus.Published) {
        throw new Error(`Draw status phải là Published — hiện ${drawBefore.status}`);
      }

      const resettleId = uuidv7();

      const transitioned = await this.drawRepo.triggerSettle(input.drawId);
      if (!transitioned) {
        // Race / retry → status đã Settling. Tiếp tục để SFN start (idempotent).
      }

      const executionName = `${toExecutionName(input.drawId)}-resettle-${drawBefore.settledAt.toISOString()}`;

      await this.sfnClient.startExecution({
        stateMachineArn: this.stateMachineArn,
        name: executionName,
        input: JSON.stringify({
          drawId: input.drawId,
          resettleId,
          lockOwnerToken: acquisition.token,
        }),
      });

      return { drawId: input.drawId, resettleId, executionName };
    } catch (err) {
      // Không release lock nếu transition đã thành công và SFN started — FinalizeSettle release.
      // Nếu fail TRƯỚC startExecution → release để cho phép retry.
      if (err instanceof Error && err.message.includes("không thể resettle")) {
        await this.lockCoordinator.release({ key: lockKey, token: acquisition.token });
      }
      throw err;
    }
  }
}

function toExecutionName(drawId: string): string {
  return drawId.replace(/[^a-zA-Z0-9-]/g, "-");
}
```

### 6.4 Cập nhật barrel `packages/game-bingo18-application/src/use-cases/draws/index.ts`

```ts
export { RepublishResultUseCase } from "./republish-result";
export { UpdateVietlottRefUseCase } from "./update-vietlott-ref";
export { TriggerResettleUseCase } from "./trigger-resettle";
```

### 6.5 Cập nhật `dto/draw.dto.ts`

Thêm DTO `RepublishResultInput`, `UpdateVietlottRefInput`, `TriggerResettleInput` mirror naming Keno.

---

## 7. Use Cases — Worker (folder `resettle/` mới)

Tất cả ở `packages/game-bingo18-application/src/use-cases/resettle/`.

### 7.1 `prepare-resettle.ts` (copy-adapt từ Keno)

```ts
import { v7 as uuidv7 } from "uuid";
import type { DrawRepository } from "../../infras/repos/draw-repo";
import type { EntryResettleRepository } from "../../infras/repos/entry-resettle-repo";

const CURSOR_BATCH_SIZE = 500;

/**
 * Resettle SFN — Bước 1.
 *
 * Workflow per invocation:
 *  1) Validate draw.status = Settling.
 *  2) clearReversalSnapshot — wipe phiên cũ (idempotent re-run).
 *  3) cursor-loop: listCandidatesForReversal → bulkSetReversal cho entries
 *     có payoutAmount > 0. reversalTx = uuidv7() mới.
 *  4) resetEntriesForResettle — reset toàn bộ entries Settled → Scheduled,
 *     $unset payout, outcome, result.
 *
 * Crash safety:
 *   - Retry SFN → cùng input → cùng resettleId → step 2 wipe phiên đang dở.
 *   - Step 3 idempotent qua filter status=Settled.
 *   - Step 4 idempotent qua filter status=Settled.
 *
 * Repository chỉ lo DB ops; business logic (sinh tx, batching) nằm ở use case.
 */
export class PrepareResettleUseCase {
  constructor(
    private readonly drawRepo: DrawRepository,
    private readonly entryResettleRepo: EntryResettleRepository,
  ) {}

  async execute(input: { drawId: string; resettleId: string }) {
    const draw = await this.drawRepo.findByDrawId(input.drawId);
    if (!draw) throw new Error(`Draw ${input.drawId} not found`);
    if (draw.status !== DrawStatus.Settling) {
      throw new Error(`Draw status phải Settling — hiện ${draw.status}`);
    }

    await this.entryResettleRepo.clearReversalSnapshot(input.drawId);

    let totalReversalCandidates = 0;
    let afterId: string | undefined = undefined;

    while (true) {
      const candidates = await this.entryResettleRepo.listCandidatesForReversal({
        drawId: input.drawId,
        afterId,
        limit: CURSOR_BATCH_SIZE,
      });
      if (candidates.length === 0) break;

      const items = candidates.map((c) => ({
        entryId: c.id,
        reversalTx: uuidv7(),
        reversalAmount: c.payoutAmount,
        resettleId: input.resettleId,
      }));
      const modified = await this.entryResettleRepo.bulkSetReversal(items);
      totalReversalCandidates += modified;

      afterId = candidates[candidates.length - 1]!.id;
      if (candidates.length < CURSOR_BATCH_SIZE) break;
    }

    const resetCount = await this.entryResettleRepo.resetEntriesForResettle(input.drawId);

    return {
      drawId: input.drawId,
      resettleId: input.resettleId,
      reversalCount: totalReversalCandidates,
      resetCount,
    };
  }
}
```

### 7.2 `enqueue-reversals.ts` (copy-adapt từ Keno)

```ts
import type { EntryResettleRepository } from "../../infras/repos/entry-resettle-repo";
import type { OutboxRepository } from "@megawin/tenant-dispatch/repos";
import { buildReversalOrder } from "@megawin/tenant-dispatch/use-cases";

const BATCH_SIZE = 500;
const GAME_ID = "bingo18" as const;

/**
 * Resettle SFN — Bước 2.
 *
 * Cursor-loop tới hết — single Lambda invocation chạy ~5K reversals dễ dàng
 * trong timeout 900s vì chỉ Mongo bulk insert (không HTTP tenant).
 *
 * batchKey convention: "bingo18:resettle:{drawId}:{resettleId}:reversal"
 * → tách hoàn toàn khỏi initial settle batch ("bingo18:settle:{drawId}:payout").
 *
 * Idempotent: outbox unique index (gameId, tx) reject duplicate.
 */
export class EnqueueReversalsUseCase {
  constructor(
    private readonly entryResettleRepo: EntryResettleRepository,
    private readonly outboxRepo: OutboxRepository,
  ) {}

  async execute(input: { drawId: string; resettleId: string }) {
    const batchKey = `bingo18:resettle:${input.drawId}:${input.resettleId}:reversal`;
    let afterTx: string | undefined = undefined;
    let totalEnqueued = 0;

    while (true) {
      const entries = await this.entryResettleRepo.getEntriesWithReversalForDispatch({
        drawId: input.drawId,
        afterTx,
        limit: BATCH_SIZE,
      });
      if (entries.length === 0) break;

      const orders = entries.map((e) =>
        buildReversalOrder({
          gameId: GAME_ID,
          drawId: input.drawId,
          tenantId: e.tenantId,
          accountId: e.accountId,
          username: e.username,
          ticketNo: e.ticketNo,
          tx: e.reversalTx,
          amount: e.reversalAmount,
          batchKey,
        }),
      );

      const inserted = await this.outboxRepo.bulkInsertOrders(orders);
      totalEnqueued += inserted;

      afterTx = entries[entries.length - 1]!.reversalTx;
      if (entries.length < BATCH_SIZE) break;
    }

    return { drawId: input.drawId, resettleId: input.resettleId, enqueued: totalEnqueued };
  }
}
```

### 7.3 Tạo barrel `packages/game-bingo18-application/src/use-cases/resettle/index.ts`

```ts
export { PrepareResettleUseCase } from "./prepare-resettle";
export { EnqueueReversalsUseCase } from "./enqueue-reversals";
```

---

## 8. Modify Settle pipeline để adapt resettle context

Tất cả ở `packages/game-bingo18-application/src/use-cases/settle/`.

### 8.1 `types.ts` — thêm `ResettleContext` + extend `SettleContext`

```ts
/**
 * Context propagate từ Resettle SFN xuống Settle SFN (nested execution).
 *
 * Sống tại Bingo 18 (KHÔNG ở game-core) vì là field nội bộ của SettleContext
 * Bingo 18 — pipeline mỗi game tự định nghĩa.
 */
export interface ResettleContext {
  /** UUIDv7 phiên resettle — propagate từ TriggerResettle. */
  resettleId: string;
  /**
   * Lock token "bingo18:resettle:{drawId}" — FinalizeSettle dùng để release lock.
   * KHÔNG có nghĩa là Settle pipeline bình thường (initial settle dùng lock khác).
   */
  lockOwnerToken: string;
}

export interface SettleContext {
  // ... fields hiện tại ...

  /**
   * Có khi Settle SFN được nest từ Resettle SFN (`startExecution.sync:2`).
   * 2 step adapt theo flag này:
   *   - EnqueueDispatchPayouts: batchKey "bingo18:resettle:..." + suffix " (resettle)" trong title.
   *   - FinalizeSettle: release business lock "bingo18:resettle:{drawId}".
   */
  resettleContext?: ResettleContext;
}
```

### 8.2 `prepare-settle.ts` — propagate `resettleContext`

PrepareSettle là entry point của Settle SFN, build `SettleContext`. Chỉ cần copy `resettleContext` từ SFN input vào output:

```ts
async execute(input: PrepareSettleInput): Promise<SettleContext> {
  // ... existing code load draw, config, ...
  return {
    // ... existing fields ...
    resettleContext: input.resettleContext,
  };
}
```

`PrepareSettleInput` thêm field `resettleContext?: ResettleContext`.

### 8.3 `enqueue-dispatch-payouts.ts` — adapt batchKey + title

```ts
async execute(ctx: SettleContext): Promise<{ enqueued: number }> {
  const isResettle = !!ctx.resettleContext;
  const resettleId = ctx.resettleContext?.resettleId;

  // batchKey:
  //   - initial settle: "bingo18:settle:{drawId}:payout"
  //   - resettle:       "bingo18:resettle:{drawId}:{resettleId}:payout"
  const batchKey = isResettle
    ? `bingo18:resettle:${ctx.draw.drawId}:${resettleId}:payout`
    : `bingo18:settle:${ctx.draw.drawId}:payout`;

  // title:
  //   - initial settle: "Bingo 18 - Kỳ {drawNo}"
  //   - resettle:       "Bingo 18 - Kỳ {drawNo} (resettle)"
  const titleSuffix = isResettle ? " (resettle)" : "";

  // ... build orders + bulk insert (giữ logic hiện tại, thay batchKey/title) ...
}
```

### 8.4 `finalize-settle.ts` — release business lock khi resettle

```ts
async execute(ctx: SettleContext): Promise<{ drawId: string; settledAt: Date }> {
  // ... existing settle finalize logic (set status: Settled, settledAt, financial, stats, settleSummary) ...

  // KHÔNG $unset reversal field — giữ làm audit trail phiên gần nhất.

  if (ctx.resettleContext) {
    await this.lockCoordinator.release({
      key: `bingo18:resettle:${ctx.draw.drawId}`,
      token: ctx.resettleContext.lockOwnerToken,
    });
  }

  return { drawId: ctx.draw.drawId, settledAt };
}
```

Constructor thêm dependency `BusinessLockCoordinator`.

### 8.5 Cập nhật barrel `index.ts`

Export `ResettleContext` cho worker layer dùng:

```ts
export type { SettleContext, ResettleContext } from "./types";
```

---

## 9. Worker layer — Resettle SFN (`apps/worker-bingo18`)

### 9.1 Tạo handlers folder `apps/worker-bingo18/src/handlers/resettle/`

#### 9.1.1 `prepare-resettle.ts` (copy-adapt Keno handler)

Init dependencies (Mongo client, repos), instantiate `PrepareResettleUseCase`, execute, return.

#### 9.1.2 `enqueue-reversals.ts` (copy-adapt Keno handler)

Init dependencies, instantiate `EnqueueReversalsUseCase`, execute, return.

### 9.2 Cập nhật handler `finalize-settle.ts` hiện tại

Inject `BusinessLockCoordinator` thêm vào dependencies (nếu chưa có) — vì giờ `FinalizeSettleUseCase` cần. Khi chạy initial settle thì `resettleContext` undefined → không release gì.

### 9.3 Cập nhật handler `prepare-settle.ts` hiện tại

Khi parse SFN input → forward `resettleContext` (nếu có) vào `PrepareSettleInput`.

### 9.4 Tạo file `apps/worker-bingo18/src/functions/resettle.yml`

(Mirror Keno — đã có sẵn ở `apps/worker-keno/src/functions/resettle.yml`):

```yaml
resettlePrepare:
  handler: src/handlers/resettle/prepare-resettle.handler
  timeout: 600

resettleEnqueueReversals:
  handler: src/handlers/resettle/enqueue-reversals.handler
  timeout: 900
```

### 9.5 Cập nhật `apps/worker-bingo18/serverless.yml`

- Include `${file(./src/functions/resettle.yml)}`.
- Thêm Resettle SFN definition (copy `apps/worker-keno/src/step-functions/resettle.ts` adapt naming + ARN refs):
  - States: `PrepareResettle` → `EnqueueReversals` → `StartSettleExecution` (sync:2 → Bingo18 Settle SFN) → `ResettleSucceeded`.
  - Input flow: `{ drawId, resettleId, lockOwnerToken }`.
  - StartSettleExecution input:
    ```
    {
      drawId.$: $.drawId,
      resettleContext: {
        resettleId.$: $.resettleId,
        lockOwnerToken.$: $.lockOwnerToken
      }
    }
    ```

### 9.6 Tạo file `apps/worker-bingo18/src/step-functions/resettle.ts`

Copy 100% từ `apps/worker-keno/src/step-functions/resettle.ts`, đổi:
- Lambda function names `keno-*-resettlePrepare` → `bingo18-*-resettlePrepare`, etc.
- StateMachine ref Settle SFN: `Bingo18SettleStateMachine` (theo naming hiện tại).
- Tên SFN: `bingo18-resettle`.

---

## 10. BO API Routes (3 routes mới + 1 split)

Tất cả ở `apps/backoffice/src/app/api/bingo18/draws/[drawId]/`.

### 10.1 Schema `_lib/schema.ts`

**Hiện tại** chỉ có `publishResultSchema`. Cần tách thành 3 schemas:

```ts
import { z } from "zod";

// Initial publish — accept numbers + optional vietlottRef.
// Bingo 18: 3 số, dải số phụ thuộc rule (giữ nguyên rule hiện tại của project).
export const publishResultSchema = z.object({
  numbers: z.array(z.number().int()).length(3),
  vietlottRef: z
    .object({
      drawPeriod: z.string().min(1),
      drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
});

// Republish — chỉ numbers (vietlottRef sửa qua endpoint riêng).
export const republishResultSchema = z.object({
  numbers: z.array(z.number().int()).length(3),
});

// Update vietlott ref — chỉ metadata.
export const updateVietlottRefSchema = z.object({
  drawPeriod: z.string().min(1),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
```

### 10.2 `publish-result/route.ts` (refactor — bỏ logic republish)

Hiện tại file `publish-result/route.ts` của Bingo 18 (theo git status đã M) cần:
- Filter use case về **chỉ initial publish** (status `salesClosed | published`, KHÔNG xử lý `settled`).
- Nếu draw `settled` → return 400 với message hướng dẫn dùng `/republish-result`.

### 10.3 `republish-result/route.ts` (mới)

```ts
import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/api-auth";
import { republishResultSchema } from "../_lib/schema";
import { RepublishResultUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
// ... DI imports ...

export const POST = withApiAuth(async (req: NextRequest, ctx) => {
  const drawId = ctx.params.drawId;
  const body = republishResultSchema.parse(await req.json());

  const useCase = new RepublishResultUseCase(drawRepo);
  const result = await useCase.execute({ drawId, numbers: body.numbers });

  return NextResponse.json(result);
});
```

### 10.4 `vietlott-ref/route.ts` (mới)

```ts
import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/api-auth";
import { updateVietlottRefSchema } from "../_lib/schema";
import { UpdateVietlottRefUseCase } from "@megawin/game-bingo18-application/use-cases/draws";

export const POST = withApiAuth(async (req: NextRequest, ctx) => {
  const drawId = ctx.params.drawId;
  const body = updateVietlottRefSchema.parse(await req.json());

  const useCase = new UpdateVietlottRefUseCase(drawRepo);
  const result = await useCase.execute({
    drawId,
    drawPeriod: body.drawPeriod,
    drawDate: body.drawDate,
  });

  return NextResponse.json(result);
});
```

### 10.5 `resettle/route.ts` (mới)

```ts
import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/api-auth";
import { TriggerResettleUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { BusinessLockCoordinator } from "@megawin/worker-core/use-cases";

export const POST = withApiAuth(async (_req: NextRequest, ctx) => {
  const drawId = ctx.params.drawId;

  const useCase = new TriggerResettleUseCase(
    drawRepo,
    new BusinessLockCoordinator(workerLockRepo),
    sfnClient,
    env.BINGO18_RESETTLE_STATE_MACHINE_ARN,
  );
  const result = await useCase.execute({ drawId });

  return NextResponse.json(result);
});
```

### 10.6 Cập nhật `apps/backoffice/src/env.ts`

Thêm env var `BINGO18_RESETTLE_STATE_MACHINE_ARN` (mirror `KENO_RESETTLE_STATE_MACHINE_ARN`).

### 10.7 Cập nhật `apps/backoffice/.env.example`

Thêm 1 dòng:
```
BINGO18_RESETTLE_STATE_MACHINE_ARN=
```

---

## 11. Backoffice UI/UX

Tất cả ở `apps/backoffice/src/app/(main)/games/bingo18/operations/_lib/`.

### 11.1 `use-operations.ts` — thêm 3 mutation hooks

Mirror Keno (đã đọc ở `keno/operations/_lib/use-operations.ts`):

```ts
export function useRepublishResult() {
  return useDrawAction<{ numbers: number[] }>(
    (id) => `/bingo18/draws/${id}/republish-result`,
    "post",
    "Đã cập nhật kết quả.",
  );
}

export function useUpdateVietlottRef() {
  return useDrawAction<{ drawPeriod: string; drawDate: string }>(
    (id) => `/bingo18/draws/${id}/vietlott-ref`,
    "post",
    "Đã cập nhật tham chiếu Vietlott.",
  );
}

export function useTriggerResettle() {
  return useDrawAction(
    (id) => `/bingo18/draws/${id}/resettle`,
    "post",
    "Đã bắt đầu kết sổ lại.",
  );
}
```

`DrawSelectorItem` **BẮT BUỘC** có thêm field `settledAt?: string` (ISO 8601). Cần update:
- `packages/game-bingo18-application/src/use-cases/operations/dto/draw-selector.dto.ts` — thêm `settledAt?: string`.
- `packages/game-bingo18-application/src/use-cases/operations/get-draw-selector.ts` — thêm `settledAt: draw.settledAt?.toISOString()` vào projection.

Đây là decision đã chốt với user — đồng nhất với pattern Keno đã M trong git status.

### 11.2 `sections/draw-management/draw-actions/`

#### 11.2.1 `publish-result-action.tsx` — refactor như Keno

- Detect `isRepublishAfterSettled = draw.status === Settled`.
- Khi republish: chỉ submit `{ numbers }` (KHÔNG submit `vietlottRef`).
- Hiển thị note "Sửa tham chiếu Vietlott qua action riêng" khi `isRepublishAfterSettled`.

#### 11.2.2 `update-vietlott-ref-action.tsx` (mới — copy 100% từ Keno)

Đổi:
- Endpoint hook: `useUpdateVietlottRef` (Bingo 18 version).
- Title: "Sửa tham chiếu Vietlott — Kỳ {drawNo}".
- Đường dẫn import `DrawSelectorItem` về Bingo 18.

#### 11.2.3 `index.ts` — export action mới

```ts
export { UpdateVietlottRefAction } from "./update-vietlott-ref-action";
```

### 11.3 `sections/draw-management/draw-command-center.tsx`

Mirror Keno (xem `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-command-center.tsx`):

- Thêm props: `onRepublishResult`, `onUpdateVietlottRef`, `onTriggerResettle`.
- Hàm `shouldShowResettle(draw)` (copy nguyên).
- `getNextAction` — thêm branch khi `status === Published && isResettleReady` → label "Kết sổ lại (Resettle)" + icon `RotateCcw` + className orange.
- Action bar:
  - `canRepublish = status ∈ { Published, Settled }` → nút "Sửa kết quả".
  - `canEditVietlottRef = status ∈ { Published, Settling, Settled }` → nút "Sửa tham chiếu Vietlott".

### 11.4 `sections/draw-management/index.tsx`

- Thêm state mở dialog: `isRepublishOpen`, `isVietlottRefOpen`, `isResettleConfirmOpen`.
- Wire mutation `useTriggerResettle` cho confirm dialog.
- Confirm dialog "Kết sổ lại" — text rõ ràng:
  > "Hệ thống sẽ debit ngược tiền các vé đã thắng (resettle), sau đó kết sổ lại theo kết quả mới. Hành động này sẽ ghi nhận vào audit log."

### 11.5 Bingo 18 có `vietlottRef` (confirmed)

Bingo 18 có `vietlottRef` (đã confirmed với user). Giữ nguyên flow `vietlott-ref` action như Keno: endpoint riêng `POST /api/bingo18/draws/{drawId}/vietlott-ref` (section 10.4) + UI dialog riêng `update-vietlott-ref-action.tsx` (section 11.2.2) + nút "Sửa tham chiếu Vietlott" trong command center.

---

## 12. Audit logging

Mirror Keno — log ở 4 điểm:

| Action | Log message | Metadata |
|---|---|---|
| `RepublishResultUseCase` thành công | "Republished draw result" | `drawId, numbers, actorId` |
| `UpdateVietlottRefUseCase` thành công | "Updated vietlott ref" | `drawId, drawPeriod, drawDate, actorId` |
| `TriggerResettleUseCase` start SFN | "Triggered resettle" | `drawId, resettleId, executionName, actorId` |
| `FinalizeSettleUseCase` (nếu `resettleContext` có) | "Resettle finalized" | `drawId, resettleId, settledAt` |

Dùng `packages/shared/src/utils/log.ts` (đã có pattern). Xác nhận structure với log helper hiện tại của project (Keno `trigger-resettle.ts` đang dùng pattern nào).

---

## 13. Verify dispatch reversal cho Bingo 18

Bingo 18 dùng `@megawin/tenant-dispatch` y hệt Keno: use case `EnqueueReversalsUseCase` chỉ ghi outbox với `gameId: "bingo18"` + `batchKey: "bingo18:resettle:..."`. Việc poll outbox + gọi tenant adapter là **trách nhiệm của tenant-dispatch worker** — Bingo 18 không cần làm gì thêm.

Checklist verify (chỉ confirm các giả định, KHÔNG investigate sâu):

| # | Verify item | Cách verify | Action nếu fail |
|---|---|---|---|
| 1 | `buildReversalOrder` accept `gameId: "bingo18"` (generic) | Đọc signature `packages/tenant-dispatch/src/use-cases/build-reversal-order.ts` (hoặc path tương đương) | Nếu hardcode "keno" → file issue tenant-dispatch generalize. Nhưng Keno đã ship → 99% đã generic |
| 2 | Outbox unique index `(gameId, tx)` đã tồn tại | Đọc `packages/tenant-dispatch/src/infras/repos/dispatch-order-repo.ts` (đã M trong git status — Keno chắc đã add nếu thiếu) | Add index migration |
| 3 | Tenant-dispatch worker có chạy cho `gameId: "bingo18"` | Đọc poller config (filter theo gameId hay all-games?) | Nếu filter theo gameId → thêm "bingo18" |

**Output**: Trước khi merge implementation, dev confirm 3 items trên trong PR description. Không cần test cross-tenant — đó là trách nhiệm của tenant-dispatch.

> **Out-of-scope**: Bingo 18 KHÔNG quan tâm tenant adapter implement debit/credit ra sao, không quan tâm webhook callback xử lý thế nào. Chỉ cần ghi outbox đúng schema. Nếu tenant-dispatch worker fail dispatch → là bug của worker đó, không phải Bingo 18.

---

## 14. Migration & rollout

### 14.1 Code migration

Không cần data migration — `reversal` field optional, `settledAt` đã được set runtime.

### 14.2 Rollout order

1. **PR 1**: Backend foundation — entity + repo + use cases + schemas + DTOs.
2. **PR 2**: Worker — handlers + step-function + serverless.yml.
3. **PR 3**: BO API + UI — routes + UI components.
4. **PR 4**: Verify dispatch reversal — section 13.
5. **PR 5**: E2E test — manual run staging với checklist 14.3.

### 14.3 Manual test checklist (staging)

- [ ] Tạo draw test → place 5 vé (3 trúng, 2 thua) → settle → verify `settledAt`, `payout`, dispatch payout xong.
- [ ] BO "Sửa kết quả" → submit numbers mới → verify `Settled → Published`, `result.publishedAt > settledAt`, `financial/stats/settleSummary` cleared.
- [ ] BO "Sửa tham chiếu Vietlott" → verify `vietlottRef` update, status không đổi, KHÔNG có resettle SFN start.
- [ ] BO "Kết sổ lại" → verify:
  - [ ] Lock acquired (call lần 2 trong 5s → 409).
  - [ ] Draw `Published → Settling`.
  - [ ] SFN execution name = `${drawId}-resettle-${oldSettledAt}`.
  - [ ] PrepareResettle: 3 entries thắng có `reversal`, 2 thua không. Tất cả reset `Settled → Scheduled`.
  - [ ] EnqueueReversals: 3 outbox orders với `tx = reversalTx` mới.
  - [ ] Nested Settle SFN re-settle theo numbers mới → outbox payout mới (batchKey resettle).
  - [ ] Lock released sau FinalizeSettle.
  - [ ] `settledAt` cập nhật mới.
  - [ ] Final: status `Settled`, `reversal` snapshot vẫn còn (audit), `payout` mới, `payoutTx` mới.
- [ ] Retry test: kill SFN giữa chừng → trigger resettle lần 2 → cùng `executionName` → không corruption.
- [ ] Multi-resettle: resettle 2 lần liên tiếp với numbers khác → phiên 2 wipe phiên 1 reversal, dispatch reversal phiên 2 dùng `reversalTx` mới.

---

## 15. Edge cases & open questions

### 15.1 Edge cases đã handle

| Edge case | Cơ chế |
|---|---|
| Staff bấm "Kết sổ lại" 2 lần | `BusinessLockCoordinator` → 409 lần 2 |
| SFN crash giữa `PrepareResettle` | `clearReversalSnapshot` wipe phiên dở; replay an toàn |
| `EnqueueReversals` crash giữa cursor | Outbox unique `tx` reject duplicate; replay từ đầu OK |
| Tenant feed flicker do bump version | KHÔNG bump version trong resettle phase (decision #13) |
| Resettle khi 0 entry thắng | `bulkSetReversal` modified=0 → skip enqueue; vẫn reset + re-settle |
| AWS giữ execution name 90 ngày | Deterministic `(drawId, settledAt)` đảm bảo cùng phiên cùng name |
| Republish numbers giống cũ | Vẫn cho phép — UX có thể warn ở client (optional) |

### 15.2 Open questions — ĐÃ CONFIRM (closed)

| # | Question | Answer |
|---|---|---|
| 1 | Bingo 18 có `vietlottRef` không? | **CÓ** — giữ flow `vietlott-ref` action như Keno (section 10.4 + 11.2.2 + 11.5). |
| 2 | Quy tắc `numbers` schema cho Bingo 18 | Dùng chung 1 cách validate — sao chép nguyên rule từ `publishResultSchema` hiện tại sang `republishResultSchema`. |
| 3 | Tenant adapter Bingo 18 hỗ trợ reversal? | Bingo 18 chỉ ghi outbox qua `@megawin/tenant-dispatch`. Tenant-dispatch worker tự xử lý dispatch + adapter. Verify lightweight 3 items ở section 13. |
| 4 | `DrawSelectorItem` đã có `settledAt`? | Plan yêu cầu **thêm vào** cả `DrawDoc` entity (section 4.2) và `DrawSelectorItem` DTO (section 11.1). |

### 15.3 Out-of-scope

- Resettle cho Mega 6/45, Power 6/55, Lotto 5/35 (jackpot — plan riêng).
- Resettle cho Max 3D / Max 3D Pro (làm sau, theo non-jackpot template).
- UI hiển thị history nhiều phiên resettle — chỉ hiện snapshot mới nhất.
- Reversal partial (resettle riêng N entry) — chỉ resettle full draw.

---

## 16. Tóm tắt files được thêm/sửa (cho PR review)

### Thêm mới

```
packages/game-bingo18-application/src/
  ├── infras/repos/
  │   ├── entry-resettle-repo.ts                  [NEW]
  │   └── types/entry.types.ts                     [NEW nếu chưa có]
  └── use-cases/
      ├── draws/
      │   ├── republish-result.ts                  [NEW]
      │   ├── update-vietlott-ref.ts               [NEW]
      │   └── trigger-resettle.ts                  [NEW]
      └── resettle/
          ├── prepare-resettle.ts                  [NEW]
          ├── enqueue-reversals.ts                 [NEW]
          └── index.ts                             [NEW]

apps/worker-bingo18/src/
  ├── handlers/resettle/
  │   ├── prepare-resettle.ts                      [NEW]
  │   └── enqueue-reversals.ts                     [NEW]
  ├── step-functions/resettle.ts                   [NEW]
  └── functions/resettle.yml                       [NEW]

apps/backoffice/src/app/api/bingo18/draws/[drawId]/
  ├── republish-result/route.ts                    [NEW]
  ├── vietlott-ref/route.ts                        [NEW]
  └── resettle/route.ts                            [NEW]

apps/backoffice/src/app/(main)/games/bingo18/operations/_lib/
  └── sections/draw-management/draw-actions/
      └── update-vietlott-ref-action.tsx           [NEW]
```

### Sửa

```
packages/game-bingo18/src/entities/
  ├── entry.ts                                     [+ EntryReversal, +reversal field]
  └── draw.ts                                      [+ settledAt?: Date]

packages/game-bingo18-application/src/
  ├── infras/repos/
  │   ├── draw-repo.ts                             [+ republishResultAfterSettled, + updateVietlottRef]
  │   ├── index.ts                                 [+ EntryResettleRepository export]
  │   └── mappers                                  [+ reversal, + settledAt; fail-fast]
  ├── use-cases/
  │   ├── draws/
  │   │   ├── dto/draw.dto.ts                      [+ DTOs]
  │   │   └── index.ts                             [+ exports]
  │   ├── operations/
  │   │   ├── dto/draw-selector.dto.ts             [+ settledAt nếu thiếu]
  │   │   └── get-draw-selector.ts                 [+ settledAt projection]
  │   └── settle/
  │       ├── types.ts                             [+ ResettleContext, + resettleContext field]
  │       ├── prepare-settle.ts                    [+ propagate resettleContext]
  │       ├── enqueue-dispatch-payouts.ts          [+ adapt batchKey + title]
  │       ├── finalize-settle.ts                   [+ release lock if resettle]
  │       └── index.ts                             [+ ResettleContext export]

apps/worker-bingo18/
  ├── serverless.yml                               [+ include resettle.yml, + Resettle SFN ref]
  └── src/handlers/
      ├── prepare-settle.ts                        [+ forward resettleContext]
      └── finalize-settle.ts                       [+ inject BusinessLockCoordinator]

apps/backoffice/src/app/api/bingo18/draws/[drawId]/
  ├── _lib/schema.ts                               [refactor: split 3 schemas]
  └── publish-result/route.ts                      [filter strict: chỉ initial publish]

apps/backoffice/src/
  ├── env.ts                                       [+ BINGO18_RESETTLE_STATE_MACHINE_ARN]
  └── app/(main)/games/bingo18/operations/_lib/
      ├── use-operations.ts                        [+ 3 mutation hooks]
      └── sections/draw-management/
          ├── draw-command-center.tsx              [+ resettle UI logic]
          ├── draw-actions/
          │   ├── publish-result-action.tsx        [refactor: separate republish path]
          │   └── index.ts                         [+ UpdateVietlottRefAction export]
          └── index.tsx                            [+ wire dialogs + mutations]

apps/backoffice/.env.example                       [+ BINGO18_RESETTLE_STATE_MACHINE_ARN=]
```

### KHÔNG sửa (reuse trực tiếp / Keno độc lập)

```
packages/worker-core/src/use-cases/business-lock-coordinator.ts
packages/tenant-dispatch/src/use-cases/  (buildPayoutOrder, buildReversalOrder, EnqueueDispatchOrders)
packages/game-keno/                                [Keno KHÔNG bị động]
packages/game-keno-application/                    [Keno giữ nguyên]
apps/worker-keno/                                  [Keno giữ nguyên]
```

---

## 17. Implement order

Theo sequence này để minimize back-pressure khi compile/test:

1. Entity + types — `entry.ts` + `EntryReversal`, `draw.ts` + `settledAt`, `settle/types.ts` + `ResettleContext`.
2. Mappers — entry mapper `reversal`, draw mapper `settledAt`, fail-fast guards.
3. Repos — `republishResultAfterSettled`, `updateVietlottRef` trong `draw-repo`. Tạo `entry-resettle-repo` (5 methods). Update barrel.
4. Use cases — draws — 3 use cases mới + DTO + barrel.
5. Use cases — resettle — 2 use cases + barrel.
6. Use cases — settle modify — `prepare-settle`, `enqueue-dispatch-payouts`, `finalize-settle` adapt theo `resettleContext`.
7. Worker handlers — `prepare-resettle.ts`, `enqueue-reversals.ts`. Update `prepare-settle`/`finalize-settle` handlers.
8. Worker step-function — `resettle.ts`, `resettle.yml`, `serverless.yml`.
9. BO API — `_lib/schema.ts` split, 3 routes mới, `publish-result/route.ts` siết filter.
10. BO env — `env.ts`, `.env.example`.
11. BO UI hooks — `use-operations.ts` 3 hooks mới.
12. BO UI components — actions + command center + dialogs wiring.
13. Verify dispatch reversal — section 13 checklist.
14. Operations DTO — `getDrawSelector` thêm `settledAt` nếu thiếu.
15. Audit log — section 12.
16. Manual E2E — section 14.3 checklist.

---

## 18. Đối chiếu plan này với Keno plan (sanity check)

| Mục | Keno | Bingo 18 plan này | Nhất quán? |
|---|---|---|---|
| KHÔNG thêm status `Resettling` | ✅ | ✅ | ✓ |
| Reuse `BusinessLockCoordinator` (worker-core) | ✅ | ✅ | ✓ |
| `resettleId` sinh ở BO API | ✅ | ✅ | ✓ |
| Lock TTL 300s | ✅ | ✅ | ✓ |
| Deterministic SFN name `(drawId, settledAt)` | ✅ | ✅ | ✓ |
| `EnqueueReversals` 1 invocation, no SFN loop | ✅ | ✅ | ✓ |
| `EntryResettleRepository` tách riêng | ✅ | ✅ | ✓ |
| KHÔNG bump `version` trong resettle phase | ✅ | ✅ | ✓ |
| Mapper fail-fast | ✅ | ✅ | ✓ |
| `settledAt` high-water mark | ✅ | ✅ | ✓ |
| `FinalizeSettle` (resettle path) KHÔNG clear `reversal` | ✅ | ✅ | ✓ |
| Tách 3 endpoints publish/republish/vietlott-ref | ✅ | ✅ | ✓ |
| `EntryReversal` extract lên `game-core` | ❌ (Keno entities) | ❌ (Bingo 18 entities) | ✓ — đúng decision #2 user |
| `ResettleContext` extract lên `game-core` | ❌ (Keno settle/types.ts) | ❌ (Bingo 18 settle/types.ts) | ✓ — đúng decision #1 user |
| `hasCappablePrize` field | ✅ Keno có | ❌ Bingo 18 không có | ✓ — khác biệt domain |
| Jackpot logic | ❌ | ❌ | ✓ |

→ **Plan này align 100% với Keno về architecture; khác biệt chỉ ở domain-specific fields (`hasCappablePrize`).**

---

## 19. Câu hỏi user — ĐÃ CONFIRM (closed)

Tất cả open questions đã được user confirm. Dev có thể implement thẳng theo section 17 mà không cần check thêm:

| # | Question | Answer |
|---|---|---|
| 1 | Bingo 18 có cần `vietlottRef`? | **CÓ** — giữ flow `vietlott-ref` action như Keno. |
| 2 | Quy tắc `numbers` schema cho Bingo 18 | Dùng chung 1 cách validate (sao chép từ `publishResultSchema` hiện tại). |
| 3 | Tenant adapter Bingo 18 hỗ trợ reversal? | Cách dùng tenant-dispatch tương tự Keno — Bingo 18 gửi outbox sang tenant-dispatch, worker tenant-dispatch tự xử lý phần còn lại. |
| 4 | `DrawSelectorItem` đã có `settledAt`? | Nếu chưa có → thêm vào cả DTO và `DrawDoc` entity. Plan đã reflect ở sections 4.2 + 11.1. |

---

**End of plan.**

---



