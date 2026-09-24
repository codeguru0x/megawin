---
name: ""
overview: ""
todos: []
isProject: false
---

# Max 3D Pro – Resettle Implementation Plan

> Mirror chính xác từ `max3d-resettle.plan.md` và implementation thực tế của Max 3D.
> Áp dụng cho Max 3D Pro với đặc thù: `TripletPair` ordered, 8 hạng giải (1 enum `PrizeTier` thống nhất), không có jackpot, schedule T3/T5/T7.

## 1. Mục tiêu & Phạm vi

Thiết kế và triển khai chức năng **resettle** (kết sổ lại) cho game Max 3D Pro để xử lý case staff phát hiện kết quả sai sau khi đã settle.

### Workflow tổng thể (3 endpoints riêng biệt)

| Endpoint | Mục đích | Khi nào dùng |
|---|---|---|
| `POST /api/max3dpro/draws/{drawId}/republish-result` | Sửa `result` (20 triplet) — transition `Settled → Published`, $unset `financial`/`stats`/`settleSummary`, GIỮ `settledAt` + `vietlottRef` | Staff phát hiện sai số quay đã publish |
| `POST /api/max3dpro/draws/{drawId}/vietlott-ref` | Sửa CHỈ `vietlottRef` (drawPeriod, drawDate) — atomic, KHÔNG kéo resettle | Sửa metadata Vietlott (không ảnh hưởng matching/payout) |
| `POST /api/max3dpro/draws/{drawId}/resettle` | Trigger Resettle SFN — snapshot reversal, reset entries, chạy lại Settle SFN | Sau khi `republish-result` thành công |

### Key technical constraints

- **Idempotency**: `reversalTx` UUIDv7 mới mỗi lần resettle, `tx` UUIDv7 mới cho payouts mới (không reuse old `payoutTx`).
- **Crash-safety**: Mỗi step Lambda commit DB trước khi return → SFN retry an toàn.
- **Lock**: `BusinessLockCoordinator` exclusive group `max3dpro-draw-ops` chặn settle/void/resettle đồng thời.
- **SFN execution name deterministic**: `resettle-{drawId}-{previousSettledAt.getTime()}` → AWS dedup retry.
- **Reuse Settle SFN**: Resettle SFN gọi nested Settle SFN (`startExecution.sync:2`) → 100% reuse logic settle hiện có.
- **`settledAt` là high-water mark**: KHÔNG bị clear khi `republish-result` — dùng để phân biệt "resettle" vs "initial settle" ở endpoint trigger.
- **Centralized key helpers (BẮT BUỘC)**: TUYỆT ĐỐI KHÔNG hardcode format `"max3dpro:resettle:..."` ở bất kỳ đâu. Dùng helper trong `@megawin/game-core/utils` làm single source of truth:
  - `buildResettleLockKey(GameProduct.Max3dpro, drawId)` → `"max3dpro:resettle:{drawId}"` cho `BusinessLockCoordinator`.
  - `buildResettleBatchKey(GameProduct.Max3dpro, drawId, resettleId, "reversal" | "payout")` → `"max3dpro:resettle:{drawId}:{resettleId}:{kind}"` cho `tenant_dispatch_orders.batchKey`.
  - `lockKey` build 1 lần ở `TriggerResettleUseCase` (BO API) → propagate vào SFN input → đẩy vào `ResettleContext.lockKey` → `FinalizeSettle` đọc trực tiếp từ context (KHÔNG rebuild). Mục đích: tránh acquire ≠ release silent bug khi đổi convention; lock chỉ giải qua TTL ~10 phút nếu sai key.

## 2. Cấu trúc tổng quan (SFN diagram)

```
[BO API: trigger-resettle]
   │  • validate (status, hasResult, settledAt, lastPublishedAt > settledAt)
   │  • acquireExclusive(buildResettleLockKey(Max3dpro, drawId), group=max3dpro-draw-ops)
   │  • drawRepo.triggerSettle (Published → Settling) [skip nếu đã Settling cho retry]
   │  • startExecution(name=resettle-{drawId}-{prevSettledAt.getTime()},
   │                    input={ drawId, resettleId, lockOwnerToken, lockKey })
   ▼
[SFN: Max3dproResettleStateMachine]
   ├── PrepareResettle (Lambda)
   │     • clearReversalSnapshot (xoá $unset reversal cũ)
   │     • listCandidatesForReversal (Settled + payoutAmount > 0)
   │     • bulkSetReversal (gen reversalTx UUIDv7, set reversal field)
   │     • resetEntriesForResettle (Settled → Scheduled, $unset payout/outcome/result)
   │
   ├── EnqueueReversals (Lambda) – có Catch + Wait 60s + retry
   │     • cursor-paginate entries có reversal (batch 500)
   │     • build TenantDispatchOrderInput (reversalBatchKey =
   │       buildResettleBatchKey(Max3dpro, drawId, resettleId, "reversal"))
   │     • bulk insert vào outbox (idempotent qua unique index `tx`)
   │
   └── StartSettleExecution (startExecution.sync:2)
         • Input: { drawId, resettleContext: { resettleId, lockOwnerToken, lockKey } }
         • Reuse 100% Max3dproSettleStateMachine
         • Settle SFN release lock ở finalize step (đọc resettleContext.lockKey)
```

## 3. Entity & Schema Changes

### 3.1 `packages/game-max3dpro/src/entities/draw.ts`

**Thêm field `settledAt`** vào `DrawDoc`:

```typescript
export interface DrawDoc {
  // ... existing fields ...

  /**
   * Thời điểm settle thành công lần gần nhất (high-water mark).
   *
   * - Set khi `FinalizeSettle` chuyển status sang `Settled` lần đầu.
   * - GIỮ NGUYÊN qua các lần `republish-result` (Settled → Published).
   * - Dùng để phân biệt "resettle" vs "initial settle" ở `TriggerResettleUseCase`:
   *     resettle = (settledAt != null) && (result.publishedAt > settledAt).
   * - SFN execution name dùng `settledAt.getTime()` cho deterministic retry.
   */
  settledAt?: Date;
}
```

### 3.2 `packages/game-max3dpro/src/entities/entry.ts`

**Thêm interface `EntryReversal` và field `reversal`** vào `TicketEntryDoc`:

```typescript
/**
 * Snapshot reversal của 1 entry — set bởi `PrepareResettle`, dispatch bởi
 * `EnqueueReversals`, GIỮ NGUYÊN sau khi resettle hoàn tất (audit trail).
 *
 * `reversalTx` là UUIDv7 mới sinh mỗi lần resettle → idempotent dispatch
 * (outbox unique index `tx` chặn double-insert nếu Lambda retry).
 *
 * `reversalAmount` snapshot từ `payout.payoutAmount` lúc Settled — KHÔNG
 * tính lại dựa trên payout mới sau khi re-settle.
 */
export interface EntryReversal {
  /** UUIDv7 cho transaction reversal — unique index ở outbox. */
  reversalTx: string;
  /** Số tiền cần đảo ngược (VND) — snapshot từ payout cũ trước khi reset. */
  reversalAmount: number;
  /** ID phiên resettle (UUIDv7) — staff trace qua `metadata.resettleId`. */
  resettleId: string;
}

export interface TicketEntryDoc {
  // ... existing fields ...

  /** Snapshot reversal — chỉ có khi entry từng được resettle. */
  reversal?: EntryReversal;
}
```

**Lưu ý**: `EntryPayoutTier` của Max 3D Pro **KHÔNG cần** `playMode` (như Max 3D) vì 8 hạng giải dùng chung 1 enum `PrizeTier` không bị collision.

## 4. Repository Changes

### 4.1 `packages/game-max3dpro-application/src/infras/repos/draw-repo.ts`

Thêm 4 methods (mirror `game-max3d-application/draw-repo.ts`):

```typescript
class DrawRepository {
  // ... existing methods ...

  /**
   * Republish result sau khi đã settled — transition Settled → Published.
   *
   * - Filter strict `status: Settled` → idempotent (gọi 2 lần lần 2 trả null).
   * - $set: status, result (kèm publishedAt mới), updatedAt.
   * - $unset: financial, stats, settleSummary (data settle cũ).
   * - GIỮ: settledAt (high-water mark), vietlottRef (metadata).
   */
  async republishResultAfterSettled(
    drawId: string,
    result: Max3dproDrawResult & { publishedAt: Date },
  ): Promise<boolean>;

  /**
   * Cập nhật vietlottRef cho draw ở Published / Settling / Settled.
   *
   * Atomic, idempotent. Filter status whitelist + $set vietlottRef + updatedAt.
   */
  async updateVietlottRef(
    drawId: string,
    vietlottRef: { drawPeriod: string; drawDate: string },
  ): Promise<boolean>;

  /**
   * Transition Published → Settling cho resettle (filter strict status).
   *
   * Trùng signature với `triggerSettle` của initial settle — dùng chung method.
   * Đảm bảo `republish-result` đã được gọi trước (status đã từ Settled về Published).
   */
  // (existing triggerSettle reuse — không cần thêm method mới)

  /**
   * Skip transition cho retry resettle: nếu draw đã ở `Settling` (do attempt
   * trước fail giữa chừng) → trả `true` để TriggerResettleUseCase coi như success.
   */
  async isInSettling(drawId: string): Promise<boolean>;
}
```

### 4.2 `packages/game-max3dpro-application/src/infras/repos/entry-resettle-repo.ts` (NEW)

Mirror chính xác từ `game-max3d-application/entry-resettle-repo.ts`. Khác duy nhất: collection `Max3dproCollections.TicketEntries`.

```typescript
import { ObjectId } from "mongodb";
import { v7 as uuidv7 } from "uuid";
import { getDb } from "@megawin/shared/infras/db";
import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import type { TicketEntryDoc, EntryReversal } from "@megawin/game-max3dpro/entities";

export interface ReversalCandidate {
  _id: ObjectId;
  payout: { payoutAmount: number };
  tenant: { tenantId: string };
}

/**
 * Repo riêng cho resettle — tách khỏi `EntryRepository` để rõ scope:
 *
 * - listCandidatesForReversal: list entries Settled + payoutAmount > 0.
 * - bulkSetReversal: gen reversalTx UUIDv7, $set reversal field (filter strict Settled).
 * - resetEntriesForResettle: Settled → Scheduled, $unset payout/outcome/result, GIỮ reversal.
 * - getEntriesWithReversalForDispatch: cursor-paginate cho EnqueueReversals.
 * - clearReversalSnapshot: $unset reversal trước khi snapshot mới (chống double-debit).
 */
export class EntryResettleRepository {
  /**
   * List entries Settled + payoutAmount > 0 — candidate cần snapshot reversal.
   * Filter projection minimal (id + payout.payoutAmount + tenant.tenantId).
   */
  async listCandidatesForReversal(drawId: string): Promise<ReversalCandidate[]>;

  /**
   * Bulk $set reversal field cho entries Settled.
   *
   * - Gen `reversalTx` UUIDv7 PER entry (idempotent dispatch).
   * - `reversalAmount` lấy từ `payout.payoutAmount` snapshot.
   * - Filter strict `status: Settled` → safe nếu race condition.
   */
  async bulkSetReversal(
    drawId: string,
    resettleId: string,
    candidates: ReversalCandidate[],
  ): Promise<number>;

  /**
   * Reset entries Settled → Scheduled trong 1 update bulk.
   *
   * - $set status: Scheduled.
   * - $unset payout, outcome, result.
   * - GIỮ reversal (audit trail), tenant snapshot, board.
   */
  async resetEntriesForResettle(drawId: string): Promise<number>;

  /**
   * Cursor-paginate entries có reversal snapshot — cho EnqueueReversals.
   * Batch size mặc định 500. Sort theo `_id ASC`.
   */
  async getEntriesWithReversalForDispatch(
    drawId: string,
    cursor: ObjectId | null,
    limit: number,
  ): Promise<TicketEntryDoc[]>;

  /**
   * $unset reversal field cho TẤT CẢ entries của 1 draw.
   * Gọi ở đầu PrepareResettle — chống double-debit khi resettle nhiều lần.
   */
  async clearReversalSnapshot(drawId: string): Promise<number>;
}
```

### 4.3 `packages/game-max3dpro-application/src/infras/repos/index.ts`

Export `EntryResettleRepository`.

### 4.4 `packages/game-max3dpro-application/src/infras/repos/types/entry.types.ts`

Thêm export `EntryReversal` từ `@megawin/game-max3dpro/entities`.

### 4.5 `packages/game-max3dpro-application/src/infras/repos/line-repo.ts`

**CRUCIAL**: Đổi `upsertLines` từ `$setOnInsert` → `$set` (như Max 3D đã làm):

```typescript
async upsertLines(lines: Max3dproLineInput[]): Promise<void> {
  // BEFORE (initial settle only):
  //   $setOnInsert: { ...line, createdAt: now }
  //
  // AFTER (resettle-friendly):
  //   $set: { matchResult, status, updatedAt, ...newFieldsFromMatching }
  //   $setOnInsert: { _id, drawId, entryId, createdAt }
  //
  // Lý do: resettle re-run match → cần overwrite matchResult mới
  // mà giữ nguyên `_id` (foreign key sang reports). Tiết kiệm DB writes
  // (delete + insert vs update in-place).
}
```

## 5. DTOs & Types

### 5.1 `packages/game-max3dpro-application/src/use-cases/draws/dto/draw.dto.ts`

Thêm 4 interface mirror Max3D (chỉ đổi `Max3dDrawResult` → `Max3dproDrawResult`):

```typescript
export interface RepublishResultInput {
  drawId: string;
  result: Max3dproDrawResult;
}
export type RepublishResultOutput = PublishResultOutput;

export interface UpdateVietlottRefInput {
  drawId: string;
  vietlottRef: { drawPeriod: string; drawDate: string };
}
export interface UpdateVietlottRefOutput {
  drawId: string;
  vietlottRef: { drawPeriod: string; drawDate: string };
}

export interface TriggerResettleInput {
  drawId: string;
  RESETTLE_SFN_ARN: string;
}
export interface TriggerResettleOutput {
  drawId: string;
  status: string;
  resettleId: string;
  lockOwnerToken: string;
}
```

### 5.2 `packages/game-max3dpro-application/src/use-cases/resettle/types.ts` (NEW)

```typescript
import type { ObjectId } from "mongodb";

export interface ResettleContext {
  /** UUIDv7 phiên resettle hiện tại — dùng tracing + `sourceContext.resettleId`. */
  resettleId: string;
  /** ownerToken `WorkerLock` — `FinalizeSettle` truyền vào `release`. */
  lockOwnerToken: string;
  /**
   * Lock key của phiên resettle (`max3dpro:resettle:{drawId}`) — propagate từ
   * `TriggerResettleUseCase` (BO API) qua SFN tới `FinalizeSettle`.
   *
   * Build qua `buildResettleLockKey(GameProduct.Max3dpro, drawId)` từ
   * `@megawin/game-core/utils` — single source of truth cho format key.
   * Propagate qua context (thay vì rebuild ở mỗi step) để tránh acquire ≠
   * release silent bug khi đổi convention (lock chỉ giải qua TTL ~10 phút).
   */
  lockKey: string;
}

export interface PrepareResettleInput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
  lockKey: string;
}
export interface PrepareResettleOutput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
  lockKey: string;
  reversalCandidateCount: number;
}

export interface EnqueueReversalsInput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
  lockKey: string;
}
export interface EnqueueReversalsOutput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
  lockKey: string;
  enqueuedCount: number;
}
```

### 5.3 `packages/game-max3dpro-application/src/use-cases/resettle/index.ts` (NEW)

Barrel export `PrepareResettleUseCase`, `EnqueueReversalsUseCase` và types.

### 5.4 `packages/game-max3dpro-application/src/use-cases/settle/types.ts`

Thêm `resettleContext?: ResettleContext` vào `SettleContext` để Settle SFN biết đang chạy resettle (dùng phân biệt log + report metadata).

## 6. Use Cases – Resettle Pipeline

### 6.1 `packages/game-max3dpro-application/src/use-cases/resettle/prepare-resettle.ts` (NEW)

Mirror chính xác Max3D. 1 use case gộp 4 logical steps để giảm Lambda invocation:

```typescript
/**
 * Step 1 của Max 3D Pro Resettle SFN — gộp:
 *
 *   1. clearReversalSnapshot — xoá reversal cũ (chống double-debit)
 *   2. listCandidatesForReversal — list Settled + payoutAmount > 0
 *   3. bulkSetReversal — gen reversalTx UUIDv7, set reversal
 *   4. resetEntriesForResettle — Settled → Scheduled
 *
 * CRASH-SAFE: mỗi step DB commit riêng → Lambda retry an toàn.
 * IDEMPOTENT: filter strict status (Settled) ở mỗi update → re-run OK.
 */
export class PrepareResettleUseCase extends LockedWorkerUseCase<
  PrepareResettleInput,
  PrepareResettleOutput
> {
  protected async execute(input: PrepareResettleInput): Promise<PrepareResettleOutput> {
    const { drawId, resettleId, lockOwnerToken, lockKey } = input;

    await this.entryResettleRepo.clearReversalSnapshot(drawId);
    const candidates = await this.entryResettleRepo.listCandidatesForReversal(drawId);

    if (candidates.length > 0) {
      await this.entryResettleRepo.bulkSetReversal(drawId, resettleId, candidates);
    }

    await this.entryResettleRepo.resetEntriesForResettle(drawId);

    return {
      drawId,
      resettleId,
      lockOwnerToken,
      lockKey,
      reversalCandidateCount: candidates.length,
    };
  }
}
```

### 6.2 `packages/game-max3dpro-application/src/use-cases/resettle/enqueue-reversals.ts` (NEW)

Mirror Max3D — chỉ đổi `GameProduct.Max3d` → `GameProduct.Max3dPro`:

```typescript
/**
 * Step 2 của Resettle SFN — enqueue reversal orders vào outbox.
 *
 * Cursor-paginate entries có reversal snapshot (batch 500), build
 * `TenantDispatchOrderInput` với `reversalBatchKey =
 * buildResettleBatchKey(GameProduct.Max3dpro, drawId, resettleId, "reversal")`,
 * bulk insert outbox `tenant_dispatch_orders`.
 *
 * Idempotent qua unique index `tx` ở outbox → Lambda retry duplicate insert
 * sẽ skip. SFN có Catch + Wait 60s + retry full nếu Lambda fail giữa batch.
 */
export class EnqueueReversalsUseCase extends LockedWorkerUseCase<
  EnqueueReversalsInput,
  EnqueueReversalsOutput
> {
  protected async execute(input: EnqueueReversalsInput): Promise<EnqueueReversalsOutput> {
    const { drawId, resettleId, lockOwnerToken, lockKey } = input;
    const reversalBatchKey = buildResettleBatchKey(
      GameProduct.Max3dpro,
      drawId,
      resettleId,
      "reversal",
    );
    const BATCH_SIZE = 500;

    let cursor: ObjectId | null = null;
    let enqueuedCount = 0;

    while (true) {
      const entries = await this.entryResettleRepo.getEntriesWithReversalForDispatch(
        drawId, cursor, BATCH_SIZE,
      );
      if (entries.length === 0) break;

      const orders = entries.map((entry) =>
        buildReversalOrder(entry, {
          gameProduct: GameProduct.Max3dPro,
          drawId,
          resettleId,
          reversalBatchKey,
        }),
      );

      await this.enqueueDispatchOrders.run({ orders });
      enqueuedCount += entries.length;
      cursor = entries[entries.length - 1]._id;
    }

    return { drawId, resettleId, lockOwnerToken, lockKey, enqueuedCount };
  }
}
```

## 7. Use Cases – Draw Operations (BO API entry points)

### 7.1 `packages/game-max3dpro-application/src/use-cases/draws/republish-result.ts` (NEW)

Mirror Max3D 100%. Validate input ở route layer qua `republishResultSchema`:

```typescript
export class RepublishResultUseCase extends NextApiUseCase<RepublishResultInput, RepublishResultOutput> {
  protected async execute(input: RepublishResultInput): Promise<RepublishResultOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    if (draw.status !== DrawStatus.Settled) {
      throw new AppException("DRAW_INVALID_TRANSITION", "Chỉ có thể sửa kết quả khi kỳ quay đã được kết sổ.");
    }

    const publishedAt = nowVN();
    const updated = await this.drawRepo.republishResultAfterSettled(input.drawId, {
      ...input.result, publishedAt,
    });

    if (!updated) {
      throw AppException.internal(`Republish kết quả kỳ ${input.drawId} thất bại — draw không còn ở "settled".`);
    }

    return {
      drawId: input.drawId,
      status: DrawStatus.Published,
      result: { ...input.result, publishedAt: publishedAt.toISOString() },
    };
  }
}
```

### 7.2 `packages/game-max3dpro-application/src/use-cases/draws/update-vietlott-ref.ts` (NEW)

Mirror Max3D 100%. Cho phép status `Published` / `Settling` / `Settled`. Atomic, idempotent.

### 7.3 `packages/game-max3dpro-application/src/use-cases/draws/trigger-resettle.ts` (NEW)

Critical use case — mirror Max3D với điều chỉnh prefix lock:

```typescript
/**
 * BO API entry — trigger Resettle SFN cho draw đã republish.
 *
 * VALIDATIONS:
 *   1. draw exists
 *   2. draw.result != null
 *   3. draw.settledAt != null   (đã từng settle)
 *   4. result.publishedAt > settledAt  (đã có republish sau lần settle gần nhất)
 *   5. status ∈ {Published, Settling}  (Settling = retry sau lần fail)
 *
 * LOCK: BusinessLockCoordinator exclusive
 *   - key: max3dpro:resettle:{drawId}
 *   - group: max3dpro-draw-ops  (chặn settle/void/resettle đồng thời)
 *
 * SFN execution name: resettle-{drawId}-{prevSettledAt.getTime()}
 *   → AWS dedup: gọi 2 lần cùng prevSettledAt sẽ throw ExecutionAlreadyExists.
 */
export class TriggerResettleUseCase extends NextApiUseCase<TriggerResettleInput, TriggerResettleOutput> {
  protected async execute(input: TriggerResettleInput): Promise<TriggerResettleOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);

    if (!draw.result) throw new AppException("DRAW_NO_RESULT", "Chưa có kết quả quay.");
    if (!draw.settledAt) throw new AppException("DRAW_NEVER_SETTLED", "Kỳ quay chưa từng được kết sổ.");
    if (draw.result.publishedAt <= draw.settledAt) {
      throw new AppException("DRAW_RESULT_NOT_REPUBLISHED", "Kết quả chưa được sửa lại sau lần settle.");
    }

    const isPublished = draw.status === DrawStatus.Published;
    const isSettlingRetry = draw.status === DrawStatus.Settling;
    if (!isPublished && !isSettlingRetry) {
      throw new AppException("DRAW_INVALID_STATUS", `Trạng thái "${draw.status}" không hỗ trợ resettle.`);
    }

    const resettleId = uuidv7();
    const lockKey = buildResettleLockKey(GameProduct.Max3dpro, input.drawId);
    const { ownerToken } = await this.lockCoordinator.acquireExclusive(lockKey, {
      group: "max3dpro-draw-ops", ttlSeconds: 1800,
    });

    try {
      if (isPublished) {
        const transitioned = await this.drawRepo.triggerSettle(input.drawId);
        if (!transitioned) throw AppException.internal(`Transition Published → Settling thất bại.`);
      }

      const executionName = `resettle-${input.drawId}-${draw.settledAt.getTime()}`;

      await this.sfn.startExecution({
        stateMachineArn: input.RESETTLE_SFN_ARN,
        name: executionName,
        input: JSON.stringify({
          drawId: input.drawId,
          resettleId,
          lockOwnerToken: ownerToken,
          lockKey,
        }),
      });

      return {
        drawId: input.drawId,
        status: DrawStatus.Settling,
        resettleId,
        lockOwnerToken: ownerToken,
      };
    } catch (err) {
      await this.lockCoordinator.releaseExclusive(lockKey, ownerToken).catch(() => {});
      throw err;
    }
  }
}
```

### 7.4 `packages/game-max3dpro-application/src/use-cases/draws/index.ts`

Thêm export `RepublishResultUseCase`, `UpdateVietlottRefUseCase`, `TriggerResettleUseCase`.

### 7.5 `FinalizeSettleUseCase` (existing) – ensure set `settledAt` + release lock từ context

Cập nhật `packages/game-max3dpro-application/src/use-cases/settle/finalize-settle.ts`:

1. Atomic update Settling → Settled phải có `$set: { settledAt: now }` (mirror Max3D).
2. Khi `resettleContext` có giá trị, release lock dùng `resettleContext.lockKey` — KHÔNG rebuild bằng `buildResettleLockKey(...)` ở đây nữa. Mục đích: bảo đảm `release()` luôn dùng đúng key đã `acquire()` ngay cả khi convention thay đổi sau này (single source of truth ở `TriggerResettleUseCase`).

```typescript
if (resettleContext) {
  await this.lockCoordinator.release({
    lockKey: resettleContext.lockKey,
    ownerToken: resettleContext.lockOwnerToken,
  });
}
```

### 7.6 `EnqueueDispatchPayoutsUseCase` (existing) – batchKey qua helper

Cập nhật `packages/game-max3dpro-application/src/use-cases/settle/enqueue-dispatch-payouts.ts` để build `batchKey`:

```typescript
import { buildResettleBatchKey } from "@megawin/game-core/utils";

const batchKey = resettleContext
  ? buildResettleBatchKey(
      GameProduct.Max3dpro,
      drawId,
      resettleContext.resettleId,
      "payout",
    )
  : `${GameProduct.Max3dpro}:settle:${drawId}:payout`;
```

Initial settle giữ nguyên format `"max3dpro:settle:{drawId}:payout"` để không phá batch key của các draw đã settle trước đó. Resettle dùng helper để có format `"max3dpro:resettle:{drawId}:{resettleId}:payout"` — staff tra cứu nhanh theo `resettleId`.

## 8. AWS Step Functions

### 8.1 `apps/worker-max3dpro/src/step-functions/resettle.asl.json` (NEW)

Mirror chính xác `apps/worker-max3d/src/step-functions/resettle.asl.json`. Đổi tên Lambda + State Machine:

```json
{
  "Comment": "Max 3D Pro Resettle Step Function – Kết sổ lại kỳ quay (crash-safe)",
  "QueryLanguage": "JSONata",
  "StartAt": "PrepareResettle",
  "States": {
    "PrepareResettle": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:ap-southeast-1:YOUR_ACCOUNT_ID:function:mw-worker-max3dpro-dev-resettle-prepare:$LATEST",
      "Next": "EnqueueReversals",
      "Retry": [{ "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException", "States.TaskFailed", "States.Timeout"], "IntervalSeconds": 10, "MaxAttempts": 3, "BackoffRate": 2 }]
    },
    "EnqueueReversals": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:ap-southeast-1:YOUR_ACCOUNT_ID:function:mw-worker-max3dpro-dev-resettle-enqueue-reversals:$LATEST",
      "Next": "StartSettleExecution",
      "Retry": [{ "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException", "States.TaskFailed", "States.Timeout"], "IntervalSeconds": 10, "MaxAttempts": 10, "BackoffRate": 2, "MaxDelaySeconds": 120, "JitterStrategy": "FULL" }],
      "Catch": [{ "ErrorEquals": ["States.ALL"], "Next": "EnqueueRetryWait" }]
    },
    "EnqueueRetryWait": { "Type": "Wait", "Seconds": 60, "Next": "EnqueueReversals" },
    "StartSettleExecution": {
      "Type": "Task",
      "Resource": "arn:aws:states:::states:startExecution.sync:2",
      "Arguments": {
        "StateMachineArn": "arn:aws:states:ap-southeast-1:YOUR_ACCOUNT_ID:stateMachine:mw-worker-max3dpro-dev-settle",
        "Input": {
          "drawId": "{% $states.input.drawId %}",
          "resettleContext": {
            "resettleId": "{% $states.input.resettleId %}",
            "lockOwnerToken": "{% $states.input.lockOwnerToken %}",
            "lockKey": "{% $states.input.lockKey %}"
          }
        }
      },
      "Next": "ResettleSucceeded",
      "Retry": [{ "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException", "States.TaskFailed", "States.Timeout"], "IntervalSeconds": 10, "MaxAttempts": 3, "BackoffRate": 2 }]
    },
    "ResettleSucceeded": { "Type": "Succeed" }
  }
}
```

### 8.2 `apps/worker-max3dpro/src/step-functions/resettle.ts` (NEW)

```typescript
import { resolveStepFunctionDefinition } from "@megawin/worker-core";
import resettleAsl from "./resettle.asl.json";

export const resettleDefinition = resolveStepFunctionDefinition(resettleAsl);
```

### 8.3 `apps/worker-max3dpro/serverless.yml`

Đăng ký state machine + thêm 2 functions:

```yaml
functions:
  # ... existing ...
  - ${file(./src/functions/resettle.yml)}

stepFunctions:
  stateMachines:
    settle:
      # ... existing settle SFN ...
    resettle:
      name: ${self:service}-${sls:stage}-resettle
      definition: ${file(./src/step-functions/resettle.ts):resettleDefinition}
      role: !GetAtt StepFunctionsRole.Arn
```

## 9. Worker Handlers

### 9.1 `apps/worker-max3dpro/src/handlers/resettle/prepare-resettle.ts` (NEW)

```typescript
import {
  PrepareResettleUseCase,
  type PrepareResettleInput,
} from "@megawin/game-max3dpro-application/use-cases/resettle";

const useCase = new PrepareResettleUseCase();

export async function handler(event: PrepareResettleInput) {
  return useCase.run(event);
}
```

### 9.2 `apps/worker-max3dpro/src/handlers/resettle/enqueue-reversals.ts` (NEW)

```typescript
import {
  EnqueueReversalsUseCase,
  type EnqueueReversalsInput,
} from "@megawin/game-max3dpro-application/use-cases/resettle";

const useCase = new EnqueueReversalsUseCase();

export async function handler(event: EnqueueReversalsInput) {
  return useCase.run(event);
}
```

### 9.3 `apps/worker-max3dpro/src/functions/resettle.yml` (NEW)

```yaml
resettle-prepare:
  handler: src/handlers/resettle/prepare-resettle.handler
  timeout: 900

resettle-enqueue-reversals:
  handler: src/handlers/resettle/enqueue-reversals.handler
  timeout: 900
```

### 9.4 `apps/worker-max3dpro/package.json`

Đảm bảo `@megawin/game-max3dpro-application` đã có dependency. Nếu chưa, thêm.

## 10. Backoffice API Routes

### 10.1 `apps/backoffice/src/app/api/max3dpro/draws/[drawId]/_lib/schema.ts` (NEW)

Mirror `_lib/schema.ts` của Max3D — chỉ đổi import `MAX3DPRO_DRAW_COUNT_*` từ `@megawin/game-max3dpro/entities` (counts giống Max3D: 2/4/6/8):

```typescript
import { z } from "zod";
import {
  MAX3DPRO_DRAW_COUNT_SPECIAL,
  MAX3DPRO_DRAW_COUNT_FIRST,
  MAX3DPRO_DRAW_COUNT_SECOND,
  MAX3DPRO_DRAW_COUNT_THIRD,
} from "@megawin/game-max3dpro/entities";

const tripletSchema = z.string().regex(/^\d{3}$/, "Bộ ba số phải là 3 chữ số (000-999).");

const resultSchema = z.object({
  special: z.array(tripletSchema).length(MAX3DPRO_DRAW_COUNT_SPECIAL, `Giải Đặc Biệt phải có đúng ${MAX3DPRO_DRAW_COUNT_SPECIAL} bộ ba số.`),
  first: z.array(tripletSchema).length(MAX3DPRO_DRAW_COUNT_FIRST, `Giải Nhất phải có đúng ${MAX3DPRO_DRAW_COUNT_FIRST} bộ ba số.`),
  second: z.array(tripletSchema).length(MAX3DPRO_DRAW_COUNT_SECOND, `Giải Nhì phải có đúng ${MAX3DPRO_DRAW_COUNT_SECOND} bộ ba số.`),
  third: z.array(tripletSchema).length(MAX3DPRO_DRAW_COUNT_THIRD, `Giải Ba phải có đúng ${MAX3DPRO_DRAW_COUNT_THIRD} bộ ba số.`),
});

const vietlottRefObjectSchema = z.object({
  drawPeriod: z.string().min(1),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const publishResultSchema = z.object({
  result: resultSchema,
  vietlottRef: vietlottRefObjectSchema.optional(),
});
export type PublishResultBody = z.infer<typeof publishResultSchema>;

export const republishResultSchema = z.object({ result: resultSchema });
export type RepublishResultBody = z.infer<typeof republishResultSchema>;

export const vietlottRefSchema = vietlottRefObjectSchema;
export type VietlottRefBody = z.infer<typeof vietlottRefSchema>;
```

### 10.2 `apps/backoffice/src/app/api/max3dpro/draws/[drawId]/republish-result/route.ts` (NEW)

```typescript
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { RepublishResultUseCase } from "@megawin/game-max3dpro-application/use-cases/draws";
import { republishResultSchema } from "../_lib/schema";

const republishResultUseCase = new RepublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(republishResultSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return republishResultUseCase.run({ drawId, result: body.result });
  });
```

### 10.3 `apps/backoffice/src/app/api/max3dpro/draws/[drawId]/vietlott-ref/route.ts` (NEW)

```typescript
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { UpdateVietlottRefUseCase } from "@megawin/game-max3dpro-application/use-cases/draws";
import { vietlottRefSchema } from "../_lib/schema";

const updateVietlottRefUseCase = new UpdateVietlottRefUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(vietlottRefSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return updateVietlottRefUseCase.run({ drawId, vietlottRef: body });
  });
```

### 10.4 `apps/backoffice/src/app/api/max3dpro/draws/[drawId]/resettle/route.ts` (NEW)

```typescript
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { TriggerResettleUseCase } from "@megawin/game-max3dpro-application/use-cases/draws";
import { env } from "@/env";

const triggerResettleUseCase = new TriggerResettleUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return triggerResettleUseCase.run({
      drawId,
      RESETTLE_SFN_ARN: env.MAX3DPRO_RESETTLE_SFN_ARN!,
    });
  });
```

### 10.5 `apps/backoffice/src/app/api/max3dpro/draws/[drawId]/publish-result/route.ts`

Update existing route để dùng `publishResultSchema` mới (cho phép `vietlottRef` optional):

```typescript
import { publishResultSchema } from "../_lib/schema";

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return publishResultUseCase.run({ drawId, result: body.result, vietlottRef: body.vietlottRef });
  });
```

### 10.6 `apps/backoffice/src/env.ts`

Thêm env var:

```typescript
MAX3DPRO_RESETTLE_SFN_ARN: z.string().optional(),
```

### 10.7 `apps/backoffice/.env.example`

Thêm dòng `MAX3DPRO_RESETTLE_SFN_ARN=`.

## 11. Backoffice UI

### 11.1 `apps/backoffice/src/app/(main)/games/max3dpro/operations/_lib/sections/draw-management/draw-actions/update-vietlott-ref-action.tsx` (NEW)

Mirror Max3D 100%. Form 2 field (`drawPeriod`, `drawDate`), POST `/api/max3dpro/draws/{drawId}/vietlott-ref`. Ảnh hưởng UI: enabled khi status `Published` / `Settling` / `Settled`.

### 11.2 `apps/backoffice/src/app/(main)/games/max3dpro/operations/_lib/sections/draw-management/draw-actions/publish-result-action.tsx`

Update để hỗ trợ 2 mode:

- **Mode publish** (status `Sales` / `Closed`): POST `/publish-result` (cho phép kèm `vietlottRef`).
- **Mode republish** (status `Settled`): POST `/republish-result` + sau đó hiển thị nút "Resettle" để trigger.

```typescript
const isRepublishMode = draw.status === DrawStatus.Settled;
const endpoint = isRepublishMode
  ? `/api/max3dpro/draws/${drawId}/republish-result`
  : `/api/max3dpro/draws/${drawId}/publish-result`;
```

### 11.3 Resettle button

Trong `draw-command-center.tsx` thêm condition show nút "Resettle":

```typescript
const canResettle = draw.status === DrawStatus.Published
  && draw.settledAt != null
  && draw.result?.publishedAt > draw.settledAt;

const canRetryResettle = draw.status === DrawStatus.Settling
  && draw.settledAt != null
  && draw.result?.publishedAt > draw.settledAt;
```

Click → confirm dialog → POST `/api/max3dpro/draws/{drawId}/resettle`. Hiển thị `resettleId` trong toast để staff trace dispatch orders.

### 11.4 `draw-actions/index.ts`

Thêm export:

```typescript
export { UpdateVietlottRefAction } from "./update-vietlott-ref-action";
export type { VietlottRefValues } from "./update-vietlott-ref-action";
```

### 11.5 `_lib/use-operations.ts`

Thêm hooks `useRepublishResult`, `useUpdateVietlottRef`, `useTriggerResettle` mirror Max3D.

### 11.6 `_lib/sections/draw-management/index.tsx`

Update để render `UpdateVietlottRefAction` ở các status hợp lệ + nút "Sửa kết quả" / "Resettle" theo state.

### 11.7 Operations selector + draw-selector DTO

Update `packages/game-max3dpro-application/src/use-cases/operations/dto/draw-selector.dto.ts` để expose `settledAt` cho UI quyết định show "Resettle":

```typescript
export interface DrawSelectorItem {
  // ... existing ...
  settledAt?: string;
  resultPublishedAt?: string;
}
```

Update `get-draw-selector.ts` để map.

## 12. Audit Logging

Mirror Max3D — log các action ở:

| Event | Log location |
|---|---|
| `republish-result` | Sau `drawRepo.republishResultAfterSettled` thành công, log `{ drawId, oldResult, newResult, staffId }`. |
| `update-vietlott-ref` | Sau update, log `{ drawId, oldRef, newRef, staffId }`. |
| `trigger-resettle` | Sau `startExecution` thành công, log `{ drawId, resettleId, staffId, lockOwnerToken, prevSettledAt }`. |

Dùng audit logger có sẵn (giống Max3D).

## 13. Migration Steps

> **Quan trọng**: Deploy theo thứ tự — code phải chạy được trước khi staff có thể trigger resettle.

1. **Entity changes** (`game-max3dpro`):
   - Thêm `settledAt?: Date` vào `DrawDoc`.
   - Thêm `EntryReversal` interface + `reversal?: EntryReversal` vào `TicketEntryDoc`.
   - Build + publish.

2. **Application package** (`game-max3dpro-application`):
   - Thêm `EntryResettleRepository` + register barrel.
   - Thêm `RepublishResultUseCase`, `UpdateVietlottRefUseCase`, `TriggerResettleUseCase`.
   - Thêm folder `use-cases/resettle/` với `PrepareResettleUseCase` + `EnqueueReversalsUseCase`.
   - Update `draw-repo.ts` thêm `republishResultAfterSettled`, `updateVietlottRef`.
   - Update `line-repo.ts` đổi `$setOnInsert` → `$set`.
   - Update `FinalizeSettleUseCase` set `settledAt`.
   - Update `SettleContext` type thêm `resettleContext?`.

3. **Worker** (`worker-max3dpro`):
   - Thêm `handlers/resettle/*.ts`.
   - Thêm `step-functions/resettle.asl.json` + `.ts`.
   - Thêm `functions/resettle.yml`.
   - Update `serverless.yml` đăng ký SFN + functions.
   - Deploy: `pnpm --filter worker-max3dpro deploy`.
   - Capture `MAX3DPRO_RESETTLE_SFN_ARN` từ output.

4. **Backoffice**:
   - Thêm env `MAX3DPRO_RESETTLE_SFN_ARN` vào `env.ts` + `.env.example` + Vercel env.
   - Thêm 3 API routes (`republish-result`, `vietlott-ref`, `resettle`).
   - Update `publish-result/route.ts` + `_lib/schema.ts`.
   - Thêm UI components (`UpdateVietlottRefAction`, button "Resettle").
   - Update `draw-command-center.tsx` + `use-operations.ts`.
   - Deploy.

5. **Smoke test**:
   - Tạo draw test → settle.
   - Republish kết quả → verify status `Settled → Published`, `settledAt` giữ nguyên.
   - Trigger resettle → verify SFN execution, dispatch orders có `metadata.resettleId`, `tx` UUIDv7 mới.
   - Verify entries: `payout` mới, `reversal` snapshot vẫn còn.

## 14. Testing Strategy

### 14.1 Unit tests

- `entry-resettle-repo.test.ts`: mock collection, verify filter strict + UUIDv7 generation.
- `prepare-resettle.test.ts`: verify gọi đủ 4 logical steps.
- `enqueue-reversals.test.ts`: verify cursor pagination + `reversalBatchKey` format.
- `trigger-resettle.test.ts`: verify 5 validations + SFN execution name format + lock acquire/release.

### 14.2 Integration tests

- Create draw → settle → verify `settledAt`.
- Republish → verify status transition + financial cleared.
- Trigger resettle (trên test SFN local hoặc mock) → verify entries reset + reversal snapshot + dispatch orders.
- Retry scenario: kill SFN giữa chừng, gọi lại → verify `executionName` deterministic chặn double execution.

### 14.3 Edge cases

- Resettle khi không có entry nào trúng (totalPayoutAmount = 0): vẫn chạy được, `enqueuedCount = 0`.
- Resettle 2 lần liên tiếp (republish → resettle → republish lại → resettle): verify `reversalTx` lần 2 khác lần 1, không double-debit tenant.
- Concurrent calls: 2 staff cùng click "Resettle" → 1 thành công, 1 fail với `LOCK_ALREADY_HELD`.
- SFN fail ở `EnqueueReversals` → Catch + Wait 60s + retry → verify dispatch orders không duplicate (unique index `tx`).

## 15. Khác biệt so với Max3D plan gốc

| Plan gốc Max3D nói | Implementation thực tế (cũng áp dụng cho Max3Dpro) |
|---|---|
| 4 SFN steps: ClearReversal → BulkSetReversal → ResetEntries → EnqueueReversals → ResetDraw | Gộp thành 2 Lambda: `PrepareResettle` (gộp 4 logical step) + `EnqueueReversals` |
| `BulkSetReversal` sinh `reversalTx` ở SFN-level | Gen ngay trong `EntryResettleRepository.bulkSetReversal` (per entry) |
| `ResetDrawForResettle` step riêng | Bỏ — `republish-result` đã transition Settled → Published trước đó |
| Lock acquire ở SFN | Lock acquire ở BO API trước khi `startExecution`, owner token truyền qua SFN input |
| Transition Settled → Settling | Thực tế: Published → Settling (vì republish đã đưa về Published trước) |

## 16. Checklist hoàn thành

- [ ] `game-max3dpro/entities`: thêm `settledAt`, `EntryReversal`, `reversal`
- [ ] `game-max3dpro-application/repos`: `entry-resettle-repo.ts` + update `draw-repo`, `line-repo`
- [ ] `game-max3dpro-application/use-cases/draws`: 3 use cases mới
- [ ] `game-max3dpro-application/use-cases/resettle`: 2 use cases + types + barrel
- [ ] `game-max3dpro-application/use-cases/settle`: update `FinalizeSettleUseCase`, `SettleContext`
- [ ] `worker-max3dpro`: 2 handlers + SFN definition + serverless.yml
- [ ] `backoffice/api`: 3 routes mới + update `publish-result` + `_lib/schema`
- [ ] `backoffice/env`: `MAX3DPRO_RESETTLE_SFN_ARN`
- [ ] `backoffice/UI`: `UpdateVietlottRefAction`, nút Resettle, hooks
- [ ] Audit log cho 3 action mới
- [ ] Tests: unit + integration
- [ ] Smoke test trên dev environment