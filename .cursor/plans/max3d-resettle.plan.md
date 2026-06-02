---
name: ""
overview: ""
todos: []
isProject: false
---

# Max3D Resettle Plan

> Mirror trực tiếp từ `bingo18-resettle.plan.md`, adapt cho Max3D-specific:
> - Số dạng triplet (000-999), 4 tầng prize (Special/First/Second/Third), 20 winning triplets/draw.
> - 2 play modes: Basic (3 lines: Bao3/Bao2/Bao1) & Plus (3 lines: Plus3/Plus2/Plus1).
> - Combo play types phức tạp.
> - Có collection riêng `max3d_ticket_lines` cho line-level data (khác Bingo18/Keno).
> - Settle pipeline có thêm `SyncTicketSummaries` + 3 reports (`BuildSettleReport`, `PublishSettleDaily`, `PublishPlayerDaily`).
> - **Không có Jackpot** (giống Bingo18).

---

## 1. Mục tiêu & Scope

### Mục tiêu
- Cho phép Backoffice **resettle** một Max3D draw đã `settled` khi phát hiện kết quả sai.
- Đảm bảo **idempotent, crash-safe** end-to-end qua AWS Step Functions.
- **Reverse** financial cũ (payout đã trả) trước khi settle lại với kết quả mới.
- **Audit đầy đủ**: ai trigger, lý do, trace từng entry bị ảnh hưởng.
- Không phá vỡ flow Settle/Void hiện tại.

### Scope
- ✅ **MỘT form "Sửa kết quả" thống nhất** ở UI cho mọi status — luôn hiển thị cả result + vietlottRef.
- ✅ **MỘT endpoint `publish-result`** orchestrate: initial publish / republish (kéo resettle) / update vietlottRef.
- ✅ Trigger Resettle SFN: lock → reverse payouts → reset entries → invoke nested Settle SFN → unlock.
- ✅ BO UI: actions + status display.
- ❌ KHÔNG hỗ trợ resettle khi draw đang `Settling/Voiding/Voided/Cancelled`.
- ❌ KHÔNG resettle nhiều lần đồng thời (business lock).

---

## 2. Quyết định kỹ thuật quan trọng

| # | Quyết định | Lý do |
|---|---|---|
| 1 | `ResettleContext` & `EntryReversal` đặt trong `game-max3d-application` | Game-specific, theo pattern Bingo18/Keno |
| 2 | Reuse `BusinessLockCoordinator` từ `worker-core` | Đã ổn định, dùng cho Settle/Void |
| 3 | Reuse `tenant-dispatch` cho reverse + dispatch lại payout | Đã có `payoutReversal` order kind |
| 4 | **MỘT endpoint duy nhất `publish-result`** orchestrate cả 3 hành vi (initial publish / republish kéo resettle / update vietlottRef) | UI dùng 1 form thống nhất cho mọi status. Backend tự quyết định dựa trên `settledAt` + so sánh result. Giảm phức tạp UI, không phân quyền lắt nhắt. Xem mục 17.2 |
| 5 | `resettleId` sinh từ BO API (UUIDv7), không phải SFN | Để BO API có thể return ID ngay cho UI track |
| 6 | Nested Settle SFN trong Resettle SFN | Reuse 100% logic settle, không duplicate |
| 7 | `EnqueueReversals` one-shot (không paginate) | Số entries 1 draw < 1000, dispatch outbox xử lý batching |
| 8 | Dedicated `EntryResettleRepository` | Tách concern, không pollute `EntryRepository` chính |
| 9 | KHÔNG bump `version` field trong interim phases | `version` chỉ bump khi finalize-settle để giữ optimistic lock semantics |
| 10 | `settledAt` là high-water mark | UI dùng `settledAt != null` (KHÔNG dùng status) để biết draw đã từng settled, gate resettle action |
| 11 | `FinalizeSettle` GIỮ NGUYÊN field `reversal` (không clear) | Audit trail. Field này chỉ ghi 1 lần khi reverse, settle lại không đụng |
| 12 | Deterministic SFN execution name: `resettle-{drawId}-{resettleId}` | Idempotent, dễ tra cứu CloudWatch |
| 13 | **Lines strategy: hybrid `$set` + `$setOnInsert`** — business fields dùng `$set`, `createdAt` dùng `$setOnInsert` | Resettle overwrite match result mới được; `createdAt` immutable (không bị refresh khi settle retry sau crash giữa chừng). Pattern bắt buộc cho mọi game |
| 14 | Reports (`BuildSettleReport`, `PublishSettleDaily`, `PublishPlayerDaily`): KHÔNG đổi | Đã idempotent (overwrite by drawId/date). Settle SFN chạy lại sẽ tự ghi đè |
| 15 | `payoutTx` mới sinh UUIDv7 khi resettle → tự nhiên > cursor cũ | `getWinningEntriesForDispatch` cursor an toàn. Outbox unique index `tx` reject duplicates |

---

## 3. Tổng quan flow

```
[BO User]
   │ click "Sửa kết quả" (1 form thống nhất cho mọi status)
   │ nhập result (special/first/second/third) + vietlottRef (optional)
   ▼
[BO API] PUT /api/max3d/draws/:drawId/publish-result
   │ body: { result: { special, first, second, third }, vietlottRef? }
   ▼
[PublishResultUseCase] — ORCHESTRATOR (xem mục 17.2)
   │ - hasSettledBefore = Boolean(draw.settledAt)  ← high-water mark
   │
   ├─ chưa từng settle → publishResult (ghi result + vietlottRef), → Published
   │
   └─ đã settle → so sánh isSame{Game}Result(draw.result, input.result)
        ├─ result KHÔNG đổi → updateVietlottRef (nếu có), GIỮ status → KHÔNG resettle
        └─ result CÓ đổi:
             ├─ status Settled  → republishResultAfterSettled(result + vietlottRef
             │                     trong 1 query, $unset financial/stats/settleSummary)
             │                     → Published (sẵn sàng resettle)
             └─ status Published → publishResult (ghi đè), giữ Published
   ▼
[BO User]
   │ click "Kết sổ lại" (Trigger Resettle) — chỉ enable khi status = Published
   │ AND settledAt != null (đã từng settle)
   │ enter reason
   ▼
[BO API] POST /api/max3d/draws/:drawId/resettle
   │ body: { reason }
   │ - generate resettleId (UUIDv7)
   │ - StartExecution Max3dResettleStateMachine
   │   name = resettle-{drawId}-{resettleId}
   │   input = { drawId, resettleId, reason, triggeredBy, triggeredAt }
   ▼
[SFN] Max3dResettleStateMachine
   ├─ 1. AcquireBusinessLock (key: max3d-resettle:{drawId})
   ├─ 2. PrepareResettle
   │     - load draw (must be Published + settledAt != null)
   │     - load entries snapshot (id, payoutTx, payoutAmount, version)
   │     - return ResettleContext
   ├─ 3. EnqueueReversals (one-shot)
   │     - for each winning entry (payoutAmount > 0):
   │         enqueue payoutReversal order vào outbox
   │         batchKey = max3d:resettle:{drawId}:{resettleId}:reversal
   │     - update entry.reversal = { resettleId, reversedTx, reversedAt }
   ├─ 4. WaitForReversalsDispatch (poll dispatch status)
   ├─ 5. ResetEntriesForResettle
   │     - bulk update entries: status = Scheduled, clear payout/result
   │     - keep entry.reversal field intact
   ├─ 6. ResetDrawForResettle
   │     - draw.status: Published → Settling
   │     - KEEP settledAt (high-water mark)
   ├─ 7. InvokeNestedSettleSFN (sync)
   │     - StartExecution Max3dSettleStateMachine
   │     - name = settle-{drawId}-{resettleId}
   │     - WaitForCompletion
   ├─ 8. ReleaseBusinessLock
   └─ 9. AuditLog (append resettle event)
```

> **Lưu ý transition**: sau khi sửa result trên draw `Settled`, orchestrator đưa draw về
> `Published` (không phải giữ `Settled`). Trigger Resettle nhận draw ở `Published` +
> `settledAt != null` → `Published → Settling`. So với thiết kế cũ (`Settled → Settling`),
> high-water mark `settledAt` mới là điều kiện gate, không phải status.

---

## 4. Entity & Schema changes

### 4.1 `packages/game-max3d/src/entities/draw.ts`

**Thêm field `settledAt` vào `DrawDoc`:**

```typescript
export interface DrawDoc {
  // ... existing fields ...
  
  /**
   * Timestamp khi draw được settle lần đầu tiên.
   * 
   * High-water mark — set 1 lần duy nhất bởi `DrawRepository.settleComplete`.
   * Resettle KHÔNG clear field này → BO UI dùng để biết draw đã từng settled.
   */
  settledAt?: Date;
}
```

> Note: `DrawRepository.settleComplete` đã set `settledAt` runtime nhưng entity chưa khai báo. Bổ sung type cho type-safety.

### 4.2 `packages/game-max3d/src/entities/entry.ts`

**Thêm field `reversal` vào `TicketEntryDoc`:**

```typescript
export interface EntryReversal {
  /** ID của resettle batch sinh ra reversal này. */
  resettleId: string;
  /** Transaction ID của reversal order trong outbox. UUIDv7. */
  reversedTx: string;
  /** Timestamp khi enqueue reversal. */
  reversedAt: Date;
  /** Số tiền reversed (= payoutAmount cũ). VND. */
  reversedAmount: number;
}

export interface TicketEntryDoc {
  // ... existing fields ...
  
  /**
   * Audit trail của lần reversal gần nhất.
   * 
   * Set bởi `EnqueueReversalsUseCase`. KHÔNG clear khi resettle lại.
   * Nếu draw bị resettle nhiều lần, field này luôn là lần resettle gần nhất.
   */
  reversal?: EntryReversal;
}
```

### 4.3 `packages/game-max3d/src/entities/draw.ts` — VALID_TRANSITIONS

**Cần 2 transition để hỗ trợ luồng sửa-kết-quả-thống-nhất + resettle:**

```typescript
export const VALID_TRANSITIONS: Record<DrawStatus, Set<DrawStatus> | undefined> = {
  // ... existing ...
  [DrawStatus.Published]: new Set([DrawStatus.Settling /* ...existing... */]), // ← cho resettle
  [DrawStatus.Settled]: new Set([DrawStatus.Published]), // ← NEW: sửa result sau settle (republishResultAfterSettled)
};
```

> **Giải thích:** Khi staff sửa result trên draw `Settled`, orchestrator gọi
> `republishResultAfterSettled` → đưa draw về `Published` (kèm `$unset` data settle).
> Resettle SFN sau đó dùng transition `Published → Settling` (gate thêm `settledAt != null`).
> Transition `Settled → Settling` cũ **không còn dùng**.

---

## 5. Repository changes

### 5.1 `packages/game-max3d-application/src/infras/repos/draw-repo.ts`

> **Quy tắc tách result vs vietlottRef ở repo layer:**
> - `result` tham gia matching/payout → đổi result buộc kéo resettle.
> - `vietlottRef` chỉ là metadata đối soát → KHÔNG kéo resettle.
> Use case orchestrate gọi đúng method; repo cung cấp 3 method dưới đây.

#### 5.1.1 `publishResult(drawId, result, vietlottRef?)` — initial publish / ghi đè khi chưa settle

Ghi `result` (+ `vietlottRef` nếu có) trong cùng `$set`, set status → `Published`.
Chấp nhận `SalesClosed → Published` (lần đầu) và `Published → Published` (sửa trước/sau khi
đã từng settle, đang chờ resettle).

```typescript
/**
 * Publish kết quả: ghi result (+ vietlottRef nếu có), set status = Published.
 *
 * Chấp nhận draws ở `SalesClosed` (initial publish) hoặc `Published`
 * (ghi đè khi sửa result lần n trước khi settle / khi đang chờ resettle).
 * Idempotent.
 */
async publishResult(
  drawId: string,
  result: Max3dDrawResult & { publishedAt: Date },
  vietlottRef?: DrawVietlottRef,
): Promise<DrawEntity | null> {
  const set: Record<string, unknown> = { result, status: DrawStatus.Published, updatedAt: new Date() };
  if (vietlottRef) set.vietlottRef = vietlottRef;

  return await this.findOneAndUpdate(
    { drawId, status: { $in: [DrawStatus.SalesClosed, DrawStatus.Published] } },
    { $set: set },
    { returnDocument: "after" },
  );
}
```

#### 5.1.2 `republishResultAfterSettled(drawId, result, vietlottRef?)` — sửa result sau settle (gộp vietlottRef)

Chuyển `Settled → Published`, ghi result mới + `$unset` data settle cũ. **Ghi luôn
`vietlottRef` trong cùng `$set`** để tránh thừa 1 round-trip mỗi lần sửa (staff thường
sửa cả result lẫn vietlottRef cùng lúc khi republish).

```typescript
/**
 * Sửa result của draw ĐÃ settled → mở luồng resettle.
 *
 * `Settled → Published`, ghi result mới, $unset financial/stats/settleSummary.
 * GIỮ NGUYÊN `settledAt` (high-water mark) — UI dùng để gate Resettle action.
 * `vietlottRef` (optional) ghi trong CÙNG $set → tránh 2 query khi staff sửa cả result + ref.
 * Idempotent qua filter `status = Settled`.
 */
async republishResultAfterSettled(
  drawId: string,
  result: Max3dDrawResult & { publishedAt: Date },
  vietlottRef?: DrawVietlottRef,
): Promise<DrawEntity | null> {
  const set: Record<string, unknown> = { result, status: DrawStatus.Published, updatedAt: new Date() };
  if (vietlottRef) set.vietlottRef = vietlottRef;

  return await this.findOneAndUpdate(
    { drawId, status: DrawStatus.Settled },
    {
      $set: set,
      $unset: { financial: "", stats: "", settleSummary: "" },
    },
    { returnDocument: "after" },
  );
}
```

#### 5.1.3 `updateVietlottRef(drawId, vietlottRef)` — chỉ update `vietlottRef` (result KHÔNG đổi)

Dùng khi orchestrator phát hiện result không đổi, chỉ sửa metadata → KHÔNG resettle.

```typescript
/**
 * Update CHỈ vietlottRef cho draw đã có result. KHÔNG đụng result/status.
 *
 * Chấp nhận `Published`, `Settling`, hoặc `Settled`. Idempotent.
 * Use case chỉ gọi method này khi result KHÔNG đổi (so sánh isSameMax3dResult).
 */
async updateVietlottRef(
  drawId: string,
  vietlottRef: DrawVietlottRef,
): Promise<DrawEntity | null> {
  return await this.findOneAndUpdate(
    { drawId, status: { $in: [DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled] } },
    { $set: { vietlottRef, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
}
```

#### 5.1.4 `triggerResettle(drawId)` — `Published → Settling`

Sau khi sửa result (`republishResultAfterSettled` đã đưa draw về `Published`), Resettle SFN
gọi method này để chuyển sang `Settling`. Gate bằng `settledAt != null` ở use-case layer.

```typescript
/**
 * Kích hoạt resettle: published → settling.
 *
 * GIỮ NGUYÊN `settledAt` (high-water mark) và `result` (đã republished trước đó).
 * Caller (PrepareResettle/ResetDraw use case) đảm bảo draw đã từng settled (settledAt != null).
 * Atomic, idempotent.
 */
async triggerResettle(drawId: string): Promise<DrawEntity | null> {
  return await this.findOneAndUpdate(
    { drawId, status: DrawStatus.Published, settledAt: { $exists: true } },
    { $set: { status: DrawStatus.Settling, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
}
```

> **Thay đổi so với thiết kế cũ:** Transition resettle giờ là `Published → Settling`
> (không phải `Settled → Settling`). `$unset` financial/stats/settleSummary đã thực hiện
> sớm hơn ở bước `republishResultAfterSettled`, nên `triggerResettle` không cần `$unset` lại.

### 5.2 `packages/game-max3d-application/src/infras/repos/entry-resettle-repo.ts` (NEW)

```typescript
import { type ClientSession } from "mongodb";
import { BaseRepo } from "@megawin/database";
import {
  ENTRIES_COLLECTION,
  type EntryReversal,
  type TicketEntryDoc,
  EntryStatus,
} from "@megawin/game-max3d/entities";
import { chunk } from "@megawin/shared/utils";

const BULK_CHUNK_SIZE = 500;

/**
 * Repository chuyên dụng cho resettle operations trên entries.
 * 
 * Tách khỏi `EntryRepository` chính để cô lập concern resettle:
 *   - Snapshot entries trước reverse
 *   - Bulk write `reversal` field
 *   - Reset entries về Scheduled (clear payout/result)
 */
export class EntryResettleRepository extends BaseRepo<TicketEntryDoc> {
  constructor() {
    super(ENTRIES_COLLECTION);
  }

  /**
   * Snapshot entries của 1 draw để reverse.
   * 
   * CHỈ lấy entries đã `Settled` và có `payoutAmount > 0`.
   * Trả về tối thiểu fields cần cho reverse: id, tenantId, accountId, 
   * username, payoutTx, payoutAmount, ticketNo.
   */
  async snapshotEntriesForReverse(drawId: string): Promise<Array<{
    id: string;
    tenantId: string;
    accountId: string;
    username: string;
    ticketNo: string;
    payoutTx: string;
    payoutAmount: number;
  }>> {
    const cursor = this.collection.find(
      {
        drawId,
        status: EntryStatus.Settled,
        "payout.payoutAmount": { $gt: 0 },
      },
      {
        projection: {
          _id: 1,
          tenantId: 1,
          accountId: 1,
          username: 1,
          ticketNo: 1,
          "payout.payoutTx": 1,
          "payout.payoutAmount": 1,
        },
      },
    );

    const docs = await cursor.toArray();
    return docs.map((d: any) => ({
      id: d._id,
      tenantId: d.tenantId,
      accountId: d.accountId,
      username: d.username,
      ticketNo: d.ticketNo,
      payoutTx: d.payout.payoutTx,
      payoutAmount: d.payout.payoutAmount,
    }));
  }

  /**
   * Ghi `reversal` audit field cho 1 batch entries.
   * Idempotent: nếu reversal đã có với cùng resettleId, skip.
   */
  async bulkWriteReversals(
    items: Array<{ entryId: string; reversal: EntryReversal }>,
  ): Promise<void> {
    if (items.length === 0) return;

    const ops = items.map(({ entryId, reversal }) => ({
      updateOne: {
        filter: {
          _id: entryId,
          $or: [
            { reversal: { $exists: false } },
            { "reversal.resettleId": { $ne: reversal.resettleId } },
          ],
        },
        update: { $set: { reversal } },
      },
    }));

    for (const batch of chunk(ops, BULK_CHUNK_SIZE)) {
      await this.bulkWrite(batch, { ordered: false });
    }
  }

  /**
   * Reset entries về `Scheduled` để chuẩn bị settle lại.
   * 
   * - Clear `payout`, `result` fields.
   * - GIỮ `reversal` field (audit trail).
   * - GIỮ `version` field (chỉ bump khi finalize-settle).
   * 
   * Idempotent: chỉ apply cho entries `Settled`.
   */
  async resetEntriesForResettle(drawId: string): Promise<{ matched: number; modified: number }> {
    const result = await this.collection.updateMany(
      { drawId, status: EntryStatus.Settled },
      {
        $set: {
          status: EntryStatus.Scheduled,
          updatedAt: new Date(),
        },
        $unset: {
          payout: "",
          result: "",
        },
      },
    );

    return { matched: result.matchedCount, modified: result.modifiedCount };
  }
}
```

### 5.3 `packages/game-max3d-application/src/infras/repos/line-repo.ts` — hybrid `$set` + `$setOnInsert`

**Đổi từ `$setOnInsert` (toàn doc) sang strategy lai**: `$set` cho business fields, `$setOnInsert` cho `createdAt`. Vừa cho phép resettle overwrite match result mới, vừa giữ `createdAt` immutable.

```typescript
async upsertLines(lines: Array<Omit<TicketLineDoc, "_id">>): Promise<void> {
  if (lines.length === 0) return;

  const ops = lines.map((doc) => {
    // Tách createdAt khỏi $set: chỉ ghi khi insert mới.
    const { createdAt, ...rest } = doc;
    return {
      updateOne: {
        filter: {
          entryId: doc.entryId,
          lineIndex: doc.lineIndex,
        },
        update: {
          $set: rest,                       // business fields — overwrite OK
          $setOnInsert: { createdAt },      // immutable timestamp
        },
        upsert: true,
      },
    };
  });

  for (const batch of chunk(ops, BULK_CHUNK_SIZE)) {
    await this.bulkWrite(batch, { ordered: false });
  }
}
```

**Tại sao 2 modifier khác nhau:**

| Field | Modifier | Lý do |
|---|---|---|
| `matchResult`, `triplets`, `payout`, ... | `$set` | Resettle re-build lines theo drawResult mới → cần overwrite. Nếu dùng `$setOnInsert`, line cũ giữ payout cũ → stale → dispatch sai. |
| `createdAt` | `$setOnInsert` | Audit-only timestamp. Settle retry sau crash giữa chừng (crash giữa `upsertLines` và `bulkSettleEntries`) gọi `upsertLines` lần 2 với `now2 ≠ now1`. Nếu dùng `$set`, `createdAt` bị refresh — không đúng semantic "thời điểm tạo". |

**Pattern này là chuẩn — áp dụng cho mọi game** (Keno, Lotto, Mega, Power, Max3D, Max3D Pro, Bingo18). Khi tham khảo plan resettle cho game mới: BẮT BUỘC dùng hybrid strategy này, không dùng `$set` cho toàn doc.

### 5.4 `packages/game-max3d-application/src/infras/repos/index.ts` — export

```typescript
export * from "./draw-repo";
export * from "./entry-repo";
export * from "./entry-resettle-repo"; // NEW
export * from "./line-repo";
// ... existing exports
```

---

## 6. DTOs & Types

### 6.1 `packages/game-max3d-application/src/use-cases/draws/dto/draw.dto.ts`

**Bổ sung `settledAt` vào DTO:**

```typescript
export interface Max3dDrawDto {
  // ... existing ...
  settledAt?: string; // ISO 8601
}
```

Mapper từ `DrawDoc` → DTO: thêm `settledAt: doc.settledAt?.toISOString()`.

### 6.2 `packages/game-max3d-application/src/use-cases/resettle/types.ts` (NEW)

```typescript
import type { Max3dDrawResult } from "@megawin/game-max3d/entities";

export interface ResettleEntrySnapshot {
  id: string;
  tenantId: string;
  accountId: string;
  username: string;
  ticketNo: string;
  payoutTx: string;
  payoutAmount: number;
}

/** Context truyền giữa các bước trong Resettle SFN. */
export interface ResettleContext {
  drawId: string;
  resettleId: string;
  reason: string;
  triggeredBy: string;
  triggeredAt: string;
  drawDate: string;
  drawNo: number;
  financialDate: string;
  result: Max3dDrawResult;
  entriesSnapshot: ResettleEntrySnapshot[];
}

export interface PrepareResettleInput {
  drawId: string;
  resettleId: string;
  reason: string;
  triggeredBy: string;
  triggeredAt: string;
}

export interface EnqueueReversalsInput {
  context: ResettleContext;
}

export interface EnqueueReversalsOutput {
  drawId: string;
  resettleId: string;
  batchKey: string;
  enqueuedCount: number;
}
```

### 6.3 `packages/game-max3d-application/src/use-cases/resettle/index.ts` (NEW)

```typescript
export * from "./types";
export * from "./prepare-resettle";
export * from "./enqueue-reversals";
export * from "./reset-entries-for-resettle";
export * from "./reset-draw-for-resettle";
```

---

## 7. Use Cases — Resettle pipeline

### 7.1 `prepare-resettle.ts`

```typescript
export class PrepareResettleUseCase extends InternalUseCase<PrepareResettleInput, ResettleContext> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryResettleRepo = new EntryResettleRepository();

  protected async execute(input: PrepareResettleInput): Promise<ResettleContext> {
    const { drawId, resettleId, reason, triggeredBy, triggeredAt } = input;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    if (draw.status !== DrawStatus.Settled) {
      throw AppException.businessRuleViolation(
        `Draw ${drawId} status = "${draw.status}", expected "settled".`,
      );
    }
    if (!draw.result) throw AppException.businessRuleViolation(`Draw ${drawId} chưa có kết quả.`);

    const entriesSnapshot = await this.entryResettleRepo.snapshotEntriesForReverse(drawId);

    return {
      drawId, resettleId, reason, triggeredBy, triggeredAt,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: draw.result,
      entriesSnapshot,
    };
  }
}
```

### 7.2 `enqueue-reversals.ts`

```typescript
export class EnqueueReversalsUseCase extends InternalUseCase<
  EnqueueReversalsInput,
  EnqueueReversalsOutput
> {
  private readonly entryResettleRepo = new EntryResettleRepository();
  private readonly enqueue = new EnqueueDispatchOrdersUseCase();

  protected async execute(input: EnqueueReversalsInput): Promise<EnqueueReversalsOutput> {
    const { context } = input;
    const { drawId, resettleId, entriesSnapshot, reason } = context;
    const batchKey = `${GameProduct.Max3d}:resettle:${drawId}:${resettleId}:reversal`;

    if (entriesSnapshot.length === 0) {
      return { drawId, resettleId, batchKey, enqueuedCount: 0 };
    }

    const reversals = entriesSnapshot.map((e) => ({
      entryId: e.id,
      reversedTx: uuidv7(),
      payoutTx: e.payoutTx,
      payoutAmount: e.payoutAmount,
    }));

    const orders = entriesSnapshot.map((e, idx) => {
      const r = reversals[idx]!;
      return buildPayoutReversalOrder({
        tx: r.reversedTx,
        tenantId: e.tenantId,
        accountId: e.accountId,
        username: e.username,
        amount: e.payoutAmount,
        gameId: GameProduct.Max3d,
        roundIds: [drawId],
        description: `Hoàn payout Max 3D kỳ ${drawId} (resettle: ${reason})`,
        metadata: { entryId: e.id, ticketNo: e.ticketNo, resettleId, originalPayoutTx: e.payoutTx },
        sourceId: e.id,
        sourceContext: { drawId, resettleId },
        batchKey,
      });
    });

    await this.enqueue.run({ orders });

    const reversedAt = new Date();
    await this.entryResettleRepo.bulkWriteReversals(
      reversals.map((r) => ({
        entryId: r.entryId,
        reversal: {
          resettleId,
          reversedTx: r.reversedTx,
          reversedAt,
          reversedAmount: r.payoutAmount,
        },
      })),
    );

    return { drawId, resettleId, batchKey, enqueuedCount: orders.length };
  }
}
```

### 7.3 `reset-entries-for-resettle.ts`

Reset entries `Settled → Scheduled`, clear `payout`/`result`, giữ `reversal`. Idempotent qua filter `status = Settled`.

### 7.4 `reset-draw-for-resettle.ts`

```typescript
export class ResetDrawForResettleUseCase extends InternalUseCase<
  ResetDrawForResettleInput,
  ResetDrawForResettleOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: ResetDrawForResettleInput): Promise<ResetDrawForResettleOutput> {
    const { drawId, resettleId } = input;
    // Draw đã ở Published (republishResultAfterSettled đã đưa về + $unset data settle).
    const updated = await this.drawRepo.triggerResettle(drawId); // Published → Settling
    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settling) {
        return { drawId, resettleId, status: DrawStatus.Settling };
      }
      throw AppException.internal(`Cannot trigger resettle. Status: ${draw?.status}`);
    }
    return { drawId, resettleId, status: updated.status };
  }
}
```

### 7.5 `publish-result.ts` (use-cases/draws/) — ORCHESTRATOR

**Đây là entry point DUY NHẤT cho mọi thao tác "nhập/sửa kết quả"** từ UI. Xem chi tiết
logic + JSDoc đầy đủ ở mục **17.2** (đã implement thực tế cho Max3D, Max3D Pro, Keno, Bingo18).

Tóm tắt: nhận `{ result, vietlottRef? }`, đọc `draw.settledAt` (high-water mark) và so sánh
result cũ vs mới (`isSameMax3dResult`) để chọn 1 trong 4 nhánh:

| Điều kiện | Hành động repo | Status sau |
|---|---|---|
| `settledAt == null` | `publishResult(result, vietlottRef)` | `Published` |
| `settledAt != null` + result KHÔNG đổi | `updateVietlottRef` (nếu có ref) | giữ nguyên |
| `settledAt != null` + result đổi + `Settled` | `republishResultAfterSettled(result, vietlottRef)` | `Published` |
| `settledAt != null` + result đổi + `Published` | `publishResult(result, vietlottRef)` | `Published` |

> **KHÔNG** tạo `republish-result.ts` / `update-vietlott-ref.ts` riêng nữa. Toàn bộ
> gói gọn trong `PublishResultUseCase`. So với thiết kế cũ (3 use case + 3 endpoint), luồng
> mới giảm phức tạp UI rất nhiều: 1 form, 1 mutation hook, 1 endpoint.

### 7.6 `trigger-resettle.ts` (use-cases/draws/)

```typescript
export class TriggerResettleUseCase extends InternalUseCase<TriggerResettleInput, TriggerResettleOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly sfn = new SFNClient({});

  protected async execute(input: TriggerResettleInput): Promise<TriggerResettleOutput> {
    const { drawId, reason, triggeredBy, stateMachineArn } = input;
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    // Gate bằng high-water mark + status Published (đã sửa result xong, chờ resettle).
    if (!draw.settledAt) {
      throw AppException.businessRuleViolation(
        `Draw ${drawId} chưa từng settled. Không thể resettle.`,
      );
    }
    if (draw.status !== DrawStatus.Published) {
      throw AppException.businessRuleViolation(
        `Draw ${drawId} status = "${draw.status}". Cần sửa kết quả (về Published) trước khi resettle.`,
      );
    }

    const resettleId = uuidv7();
    const triggeredAt = new Date().toISOString();
    const executionName = `resettle-${drawId.replace(/\./g, "-")}-${resettleId}`;

    const result = await this.sfn.send(
      new StartExecutionCommand({
        stateMachineArn,
        name: executionName,
        input: JSON.stringify({ drawId, resettleId, reason, triggeredBy, triggeredAt }),
      }),
    );

    return { drawId, resettleId, executionArn: result.executionArn! };
  }
}
```

### 7.7 Export barrel `use-cases/draws/index.ts`

```typescript
export * from "./publish-result";   // orchestrator (đã có sẵn)
export * from "./trigger-resettle";  // NEW cho resettle
// KHÔNG export republish-result / update-vietlott-ref (đã gộp vào publish-result)
```

---

## 8. AWS Step Functions

### 8.1 `apps/worker-max3d/src/step-functions/resettle.asl.json` (NEW)

```json
{
  "Comment": "Max3D Resettle State Machine",
  "StartAt": "AcquireBusinessLock",
  "States": {
    "AcquireBusinessLock": {
      "Type": "Task",
      "Resource": "${AcquireBusinessLockFunctionArn}",
      "Parameters": {
        "lockKey.$": "States.Format('max3d-resettle:{}', $.drawId)",
        "ownerId.$": "$$.Execution.Name",
        "ttlSeconds": 3600
      },
      "ResultPath": "$.lock",
      "Next": "PrepareResettle",
      "Catch": [
        {
          "ErrorEquals": ["States.ALL"],
          "ResultPath": "$.error",
          "Next": "FailLockNotAcquired"
        }
      ]
    },
    "PrepareResettle": {
      "Type": "Task",
      "Resource": "${PrepareResettleFunctionArn}",
      "InputPath": "$",
      "Parameters": {
        "drawId.$": "$.drawId",
        "resettleId.$": "$.resettleId",
        "reason.$": "$.reason",
        "triggeredBy.$": "$.triggeredBy",
        "triggeredAt.$": "$.triggeredAt"
      },
      "ResultPath": "$.context",
      "Next": "EnqueueReversals",
      "Catch": [
        { "ErrorEquals": ["States.ALL"], "ResultPath": "$.error", "Next": "ReleaseLockOnFailure" }
      ]
    },
    "EnqueueReversals": {
      "Type": "Task",
      "Resource": "${EnqueueReversalsFunctionArn}",
      "Parameters": { "context.$": "$.context" },
      "ResultPath": "$.reversalResult",
      "Next": "WaitForReversalsDispatch",
      "Catch": [
        { "ErrorEquals": ["States.ALL"], "ResultPath": "$.error", "Next": "ReleaseLockOnFailure" }
      ]
    },
    "WaitForReversalsDispatch": {
      "Type": "Wait",
      "Seconds": 30,
      "Next": "ResetEntriesForResettle"
    },
    "ResetEntriesForResettle": {
      "Type": "Task",
      "Resource": "${ResetEntriesForResettleFunctionArn}",
      "Parameters": {
        "drawId.$": "$.drawId",
        "resettleId.$": "$.resettleId"
      },
      "ResultPath": "$.resetEntriesResult",
      "Next": "ResetDrawForResettle",
      "Catch": [
        { "ErrorEquals": ["States.ALL"], "ResultPath": "$.error", "Next": "ReleaseLockOnFailure" }
      ]
    },
    "ResetDrawForResettle": {
      "Type": "Task",
      "Resource": "${ResetDrawForResettleFunctionArn}",
      "Parameters": {
        "drawId.$": "$.drawId",
        "resettleId.$": "$.resettleId"
      },
      "ResultPath": "$.resetDrawResult",
      "Next": "InvokeNestedSettleSFN",
      "Catch": [
        { "ErrorEquals": ["States.ALL"], "ResultPath": "$.error", "Next": "ReleaseLockOnFailure" }
      ]
    },
    "InvokeNestedSettleSFN": {
      "Type": "Task",
      "Resource": "arn:aws:states:::states:startExecution.sync:2",
      "Parameters": {
        "StateMachineArn": "${Max3dSettleStateMachineArn}",
        "Name.$": "States.Format('settle-{}-{}', $.drawId, $.resettleId)",
        "Input": {
          "drawId.$": "$.drawId"
        }
      },
      "ResultPath": "$.settleResult",
      "Next": "ReleaseBusinessLock",
      "Catch": [
        { "ErrorEquals": ["States.ALL"], "ResultPath": "$.error", "Next": "ReleaseLockOnFailure" }
      ]
    },
    "ReleaseBusinessLock": {
      "Type": "Task",
      "Resource": "${ReleaseBusinessLockFunctionArn}",
      "Parameters": {
        "lockKey.$": "States.Format('max3d-resettle:{}', $.drawId)",
        "ownerId.$": "$$.Execution.Name"
      },
      "ResultPath": "$.lockReleased",
      "Next": "Success"
    },
    "ReleaseLockOnFailure": {
      "Type": "Task",
      "Resource": "${ReleaseBusinessLockFunctionArn}",
      "Parameters": {
        "lockKey.$": "States.Format('max3d-resettle:{}', $.drawId)",
        "ownerId.$": "$$.Execution.Name"
      },
      "ResultPath": "$.lockReleased",
      "Next": "Fail"
    },
    "FailLockNotAcquired": {
      "Type": "Fail",
      "Error": "BusinessLockNotAcquired",
      "Cause": "Another resettle/settle/void is in progress for this draw."
    },
    "Success": { "Type": "Succeed" },
    "Fail": { "Type": "Fail" }
  }
}
```

### 8.2 `apps/worker-max3d/src/step-functions/resettle.ts` (NEW)

Định nghĩa state machine resource cho Serverless framework:

```typescript
import resettleAsl from "./resettle.asl.json";

export const resettleStateMachine = {
  name: "Max3dResettleStateMachine",
  definition: resettleAsl,
  dependsOn: ["Max3dSettleStateMachine"],
};
```

### 8.3 Update `apps/worker-max3d/src/step-functions/settle.asl.json`

Settle SFN của Max3D đã có `AcquireBusinessLock`. Cần update để **chấp nhận lock owner từ caller** khi được invoke bởi Resettle SFN — tránh deadlock. Pattern: nếu `$.parentLockOwnerId` có giá trị, skip `AcquireBusinessLock` và `ReleaseBusinessLock` (parent đang giữ lock).

> **Tham khảo**: Bingo18 plan mô tả pattern này. Có 2 lựa chọn:
> - **Option A**: Thêm `Choice` state ở đầu Settle SFN check `$.parentLockOwnerId`. Nếu có → skip lock steps.
> - **Option B**: Resettle SFN dùng lock key khác (`max3d-resettle:{drawId}` vs `max3d-settle:{drawId}`) → không xung đột. Đây là approach của Bingo18.
> 
> **Chọn Option B**: dùng lock key riêng. Resettle dùng `max3d-resettle:{drawId}`, Settle dùng `max3d-settle:{drawId}` (key đã có). Không cần đổi Settle SFN.

### 8.4 Update `apps/worker-max3d/src/step-functions/void.asl.json`

KHÔNG cần đổi. Void dùng lock key riêng `max3d-void:{drawId}`.

> **Cross-lock guarantee**: Cần thêm coordination giữa 3 lock keys (settle/void/resettle) để tránh chạy đồng thời. Tham khảo `BusinessLockCoordinator` trong worker-core — đã hỗ trợ "exclusive groups". Cần update group config:
>
> ```typescript
> // packages/worker-core/src/use-cases/business-lock-coordinator.ts
> // Group: tất cả ops trên cùng 1 draw phải exclusive
> "max3d-draw-ops": ["max3d-settle", "max3d-void", "max3d-resettle"]
> ```

---

## 9. Worker handlers

### 9.1 `apps/worker-max3d/src/handlers/resettle/prepare-resettle.ts` (NEW)

```typescript
import { LockedWorkerUseCase } from "@megawin/worker-core";
import { PrepareResettleUseCase } from "@megawin/game-max3d-application";
import type { PrepareResettleInput, ResettleContext } from "@megawin/game-max3d-application";

export const handler = async (input: PrepareResettleInput): Promise<ResettleContext> => {
  return await new PrepareResettleUseCase().run(input);
};
```

### 9.2 `apps/worker-max3d/src/handlers/resettle/enqueue-reversals.ts` (NEW)

```typescript
import { EnqueueReversalsUseCase } from "@megawin/game-max3d-application";
import type { EnqueueReversalsInput, EnqueueReversalsOutput } from "@megawin/game-max3d-application";

export const handler = async (input: EnqueueReversalsInput): Promise<EnqueueReversalsOutput> => {
  return await new EnqueueReversalsUseCase().run(input);
};
```

### 9.3 `apps/worker-max3d/src/handlers/resettle/reset-entries-for-resettle.ts` (NEW)

```typescript
import { ResetEntriesForResettleUseCase } from "@megawin/game-max3d-application";

export const handler = async (input: { drawId: string; resettleId: string }) => {
  return await new ResetEntriesForResettleUseCase().run(input);
};
```

### 9.4 `apps/worker-max3d/src/handlers/resettle/reset-draw-for-resettle.ts` (NEW)

```typescript
import { ResetDrawForResettleUseCase } from "@megawin/game-max3d-application";

export const handler = async (input: { drawId: string; resettleId: string }) => {
  return await new ResetDrawForResettleUseCase().run(input);
};
```

### 9.5 `apps/worker-max3d/src/functions/resettle.yml` (NEW)

```yaml
prepareResettle:
  handler: src/handlers/resettle/prepare-resettle.handler
  timeout: 60
  events: []

enqueueReversals:
  handler: src/handlers/resettle/enqueue-reversals.handler
  timeout: 300
  memorySize: 1024
  events: []

resetEntriesForResettle:
  handler: src/handlers/resettle/reset-entries-for-resettle.handler
  timeout: 60
  events: []

resetDrawForResettle:
  handler: src/handlers/resettle/reset-draw-for-resettle.handler
  timeout: 30
  events: []
```

### 9.6 Update `apps/worker-max3d/serverless.yml`

```yaml
functions:
  # ... existing ...
  ${file(./src/functions/resettle.yml)}

stepFunctions:
  stateMachines:
    Max3dSettleStateMachine: # existing
      # ...
    Max3dVoidStateMachine: # existing
      # ...
    Max3dResettleStateMachine: # NEW
      name: Max3dResettleStateMachine
      definition: ${file(./src/step-functions/resettle.asl.json)}
      dependsOn:
        - Max3dSettleStateMachine
```

Cần inject substitutions vào ASL: `AcquireBusinessLockFunctionArn`, `ReleaseBusinessLockFunctionArn`, `PrepareResettleFunctionArn`, `EnqueueReversalsFunctionArn`, `ResetEntriesForResettleFunctionArn`, `ResetDrawForResettleFunctionArn`, `Max3dSettleStateMachineArn`.

---

## 10. Backoffice API

### 10.1 `apps/backoffice/.env.example`

Thêm:
```
MAX3D_RESETTLE_SFN_ARN=arn:aws:states:ap-southeast-1:xxx:stateMachine:Max3dResettleStateMachine
```

### 10.2 `apps/backoffice/src/env.ts`

```typescript
MAX3D_RESETTLE_SFN_ARN: z.string().min(1),
```

### 10.3 `apps/backoffice/src/app/api/max3d/draws/[drawId]/_lib/schema.ts`

Chỉ cần 2 schema: `publishResultSchema` (form thống nhất) + `triggerResettleSchema`.

```typescript
import { z } from "zod";
import {
  MAX3D_DRAW_COUNT_SPECIAL,
  MAX3D_DRAW_COUNT_FIRST,
  MAX3D_DRAW_COUNT_SECOND,
  MAX3D_DRAW_COUNT_THIRD,
} from "@megawin/game-max3d/entities";

const tripletSchema = z
  .string()
  .regex(/^\d{3}$/, "Mỗi bộ ba phải đúng 3 chữ số (000-999).");

export const drawResultSchema = z.object({
  special: z.array(tripletSchema).length(MAX3D_DRAW_COUNT_SPECIAL),
  first: z.array(tripletSchema).length(MAX3D_DRAW_COUNT_FIRST),
  second: z.array(tripletSchema).length(MAX3D_DRAW_COUNT_SECOND),
  third: z.array(tripletSchema).length(MAX3D_DRAW_COUNT_THIRD),
});

export const vietlottRefSchema = z.object({
  drawPeriod: z.string().min(1),
  drawDate: z.string().min(1),
});

/** Form thống nhất: result bắt buộc, vietlottRef optional. Backend orchestrate hành vi. */
export const publishResultSchema = z.object({
  result: drawResultSchema,
  vietlottRef: vietlottRefSchema.optional(),
});

export const triggerResettleSchema = z.object({
  reason: z.string().min(5).max(500),
});
```

> **Bỏ** `republishResultSchema` + `updateVietlottRefSchema` — không còn endpoint riêng.

### 10.4 `apps/backoffice/src/app/api/max3d/draws/[drawId]/publish-result/route.ts` — endpoint DUY NHẤT cho sửa kết quả

```typescript
import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/error-handler";
import { requireBackofficeAuth } from "@/lib/api/auth";
import { PublishResultUseCase } from "@megawin/game-max3d-application";
import { publishResultSchema } from "../_lib/schema";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ drawId: string }> },
) {
  try {
    await requireBackofficeAuth(req, ["max3d:operations:publish-result"]);
    const { drawId } = await ctx.params;
    const body = await req.json();
    const parsed = publishResultSchema.parse(body);

    // 1 use case orchestrate cả initial publish / republish (resettle) / update vietlottRef.
    const result = await new PublishResultUseCase().run({
      drawId,
      result: parsed.result,
      vietlottRef: parsed.vietlottRef,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

> **Đã XOÁ** `republish-result/route.ts` và `vietlott-ref/route.ts` — gộp hết vào endpoint này.

### 10.5 `apps/backoffice/src/app/api/max3d/draws/[drawId]/resettle/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { handleApiError } from "@/lib/api/error-handler";
import { requireBackofficeAuth } from "@/lib/api/auth";
import { TriggerResettleUseCase } from "@megawin/game-max3d-application";
import { triggerResettleSchema } from "../_lib/schema";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ drawId: string }> },
) {
  try {
    const { user } = await requireBackofficeAuth(req, ["max3d:operations:resettle"]);
    const { drawId } = await ctx.params;
    const body = await req.json();
    const parsed = triggerResettleSchema.parse(body);

    const result = await new TriggerResettleUseCase().run({
      drawId,
      reason: parsed.reason,
      triggeredBy: user.id,
      stateMachineArn: env.MAX3D_RESETTLE_SFN_ARN,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

## 11. Backoffice UI

Theo pattern `apps/backoffice/src/app/(main)/games/bingo18/operations/_lib/sections/draw-management/`. Mirror toàn bộ cấu trúc cho Max3D tại `apps/backoffice/src/app/(main)/games/max3d/operations/_lib/sections/draw-management/`.

> **Nguyên tắc cốt lõi (đã áp dụng cho Max3D/Max3DPro/Keno/Bingo18):**
> **MỘT form "Sửa kết quả" thống nhất cho mọi status** — luôn hiển thị cả ô nhập result
> lẫn vietlottRef. Backend (`PublishResultUseCase`) tự quyết định initial publish /
> republish (kéo resettle) / update vietlottRef. UI **không** cần biết đang ở nhánh nào.

### 11.1 `draw-actions/publish-result-action.tsx` — form sửa kết quả DUY NHẤT

Modal dùng chung cho mọi status (`SalesClosed` / `Published` / `Settled`):
- Pre-fill form từ `draw.result` nếu đã có (4 mảng triplets: special/first/second/third).
- Pre-fill vietlottRef từ `draw.vietlottRef` nếu có. **Luôn hiển thị** ô vietlottRef.
- Validate y hệt `publishResultSchema`.
- **Ẩn nút "Sửa kết quả" khi `draw.status === Settling`** (đang kết sổ, không cho sửa).
- Submit → `PUT /api/max3d/draws/:drawId/publish-result`.
- Toast theo status trả về:
  - status `Published` (lần đầu hoặc sau khi sửa post-settle): "Đã lưu kết quả."
  - không đổi gì (chỉ vietlottRef): "Đã cập nhật tham chiếu Vietlott."
- Invalidate query draw detail sau success.

> **KHÔNG** tạo `republish-result-action.tsx` và `update-vietlott-ref-action.tsx` riêng.
> Đã xoá khỏi cả 4 game.

### 11.2 `draw-actions/trigger-resettle-action.tsx` (NEW)

Confirmation dialog:
- Display: drawId, current result (4 prize tiers), settledAt timestamp.
- Required field: `reason` (textarea, min 5 chars, max 500).
- Cảnh báo "Resettle sẽ reverse toàn bộ payout đã trả và settle lại với kết quả mới."
- **Chỉ enable khi `draw.status === Published` AND `draw.settledAt != null`** (đã sửa
  result xong, draw đã quay về Published, từng settled) AND user có permission
  `max3d:operations:resettle`.
- Submit → `POST /api/max3d/draws/:drawId/resettle`.
- Toast với `resettleId` để user track.

### 11.3 Update `draw-actions/index.ts`

```typescript
export * from "./publish-result-action";    // form thống nhất (sửa kết quả + vietlottRef)
export * from "./trigger-resettle-action";   // NEW
export * from "./trigger-settle-action";      // existing
export * from "./trigger-void-action";        // existing
// KHÔNG export republish-result-action / update-vietlott-ref-action (đã gộp/xoá)
```

### 11.4 Update `draw-command-center.tsx`

Render conditionally theo `draw.status` + `settledAt`:

| Status | settledAt | Buttons |
|---|---|---|
| `SalesClosed` / `Published` | `null` (chưa settle) | **Sửa kết quả**, Trigger Settle |
| `Settling` / `Voiding` | — | (no actions, show progress) |
| `Settled` | `!= null` | **Sửa kết quả** (post-settle → kéo về Published) |
| `Published` | `!= null` (chờ resettle) | **Sửa kết quả**, **Trigger Resettle** |
| `Voided` / `Cancelled` | — | (no actions) |

Hiển thị `settledAt` badge nếu có. **Không** còn nút "Sửa tham chiếu Vietlott" riêng —
vietlottRef nằm trong form "Sửa kết quả".

### 11.5 Update `_lib/use-operations.ts`

Thêm hooks SWR + mutation:
- `usePublishResult(drawId)` — `useSWRMutation` PUT (đã có sẵn, dùng cho mọi thao tác sửa kết quả).
- `useTriggerResettle(drawId)` — `useSWRMutation` POST (NEW).

> **Bỏ** `useRepublishResult` / `useUpdateVietlottRef` — đã gộp vào `usePublishResult`.

Mỗi mutation success → `mutate()` để re-fetch draw detail.

### 11.6 Update `_lib/sections/draw-management/index.tsx`

Mount `PublishResultAction` + `TriggerResettleAction` trong `DrawCommandCenter`. Wire user
permissions từ session. Bỏ state `vietlottRefOpen` và mọi tham chiếu modal vietlottRef riêng.

### 11.7 Update `get-draw-selector.ts` use-case + DTO

Đảm bảo selector trả về:
- `settledAt` (ISO 8601, có thể null).
- `vietlottRef` (object với `drawPeriod`, `drawDate`).
- Status hiện tại để UI gate buttons.

Update `packages/game-max3d-application/src/use-cases/operations/dto/draw-selector.dto.ts` để bao gồm các field này.

---

## 12. Audit Logging

### 12.1 Audit events

Mỗi action sinh 1 event vào `audit_logs` (collection chung backoffice):

| Event | Payload |
|---|---|
| `max3d.draw.publish-result` | `{ drawId, action: "initial" \| "republish" \| "vietlott-ref-only", oldResult?, newResult, actorId }` |
| `max3d.draw.resettle.triggered` | `{ drawId, resettleId, reason, actorId, executionArn }` |
| `max3d.draw.resettle.completed` | `{ drawId, resettleId, durationMs, reversedCount, settleResult }` |
| `max3d.draw.resettle.failed` | `{ drawId, resettleId, error, step }` |

### 12.2 Implementation

- BO API endpoints: append audit log trước khi return response (use `AuditLogger` từ shared infrastructure).
- SFN: thêm step cuối cùng (sau Success/Fail) gọi `AuditLogger` qua Lambda task. Hoặc: BO API poll status → ghi completion event khi SFN finish.

> Tham khảo Bingo18 plan: dùng EventBridge rule listen SFN execution status change → invoke audit logger.

---

## 13. Migration

### 13.1 Code migration

1. Add `settledAt` field type to `DrawDoc` interface (no DB migration — runtime đã set).
2. Add `reversal` field type to `TicketEntryDoc` interface (no DB migration — chỉ ghi khi resettle).
3. Add new collections indexes (nếu cần) cho `entry-resettle-repo` queries:

```javascript
// max3d_ticket_entries
db.max3d_ticket_entries.createIndex(
  { drawId: 1, status: 1, "payout.payoutAmount": 1 },
  { name: "drawId_status_payoutAmount_resettle" }
);
```

### 13.2 DB migration

KHÔNG cần migration data. Field `settledAt` và `reversal` đều là optional → backward compatible.

### 13.3 Deployment order

1. Deploy `packages/*` (entities, application packages).
2. Deploy `apps/worker-max3d` (functions + state machine).
3. Deploy `apps/backoffice` (env var `MAX3D_RESETTLE_SFN_ARN` đã có giá trị từ step 2).
4. Smoke test trên staging với 1 draw đã settled.

### 13.4 Rollback

- BO UI: feature flag `max3d.resettle.enabled` để hide/show buttons.
- SFN: state machine có thể giữ lại (idle), không tốn cost.
- DB: fields optional, không impact cho draws cũ.

---

## 14. Testing strategy

### 14.1 Unit tests

| File | Coverage |
|---|---|
| `entry-resettle-repo.test.ts` | snapshotEntriesForReverse / bulkWriteReversals / resetEntriesForResettle idempotency |
| `prepare-resettle.test.ts` | validate draw status, snapshot entries |
| `enqueue-reversals.test.ts` | empty entries / reversal orders count / batchKey format |
| `reset-draw-for-resettle.test.ts` | Settled→Settling, idempotent re-run |
| `trigger-resettle.test.ts` | SFN start with deterministic name, validate status |
| `republish-result.test.ts` | only update result, reject non-Settled |
| `update-vietlott-ref.test.ts` | accept Published/Settling/Settled |

### 14.2 Integration tests

- `resettle-e2e.test.ts`: full flow từ trigger → reverse → settle lại với mocked SFN.
- Idempotency: trigger 2 lần với cùng resettleId → SFN reject duplicate execution name.
- Crash recovery: kill ResetEntriesForResettle giữa chừng → rerun → entries hoàn toàn Scheduled.

### 14.3 Manual QA scenarios

1. **Happy path**: settled draw → republish kết quả mới → resettle → verify entries có new payouts theo result mới.
2. **Vietlott ref alone**: update vietlottRef khi draw đang Settled → result không đổi.
3. **Concurrent guard**: trigger 2 resettles đồng thời → 1 thành công, 1 fail BusinessLockNotAcquired.
4. **No winners scenario**: resettle draw mà cả old và new result đều không có winners → no reversals, settle lại OK.
5. **Mixed scenario**: old result có 5 winners, new result có 3 winners (2 chung) → 5 reversals, 3 new payouts.

---

## 15. Open questions / Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Tenant từ chối reversal (số dư âm) | Tenant-dispatch retry lane đã handle. Audit log để track |
| 2 | Reports cũ đã publish ra player UI | Reports idempotent overwrite. Player thấy data mới sau resettle |
| 3 | Lines `$set` thay đổi behavior cũ | Test kỹ với existing draws settled → verify lines không bị duplicate / sai data |
| 4 | Player có pending payout cũ trong outbox khi resettle | Outbox order với cùng `tx` đã unique. Nhưng `payoutTx` cũ vs `reversedTx` mới khác nhau → cần guard: check entry.payout.payoutTx đã dispatched chưa trước khi reverse. Bingo18 plan đã handle qua `payoutTx` cursor — Max3D reuse pattern |
| 5 | SFN nested execution timeout | Settle SFN của Max3D có thể chạy lâu (3 reports). Tăng timeout của Resettle SFN parent execution, hoặc dùng `.sync:2` thay vì `.sync` để long-poll |

---

## 16. Implementation checklist

### Phase 1: Domain & Repos
- [ ] Add `settledAt` to `DrawDoc` (entities)
- [ ] Add `reversal` + `EntryReversal` to `TicketEntryDoc` (entities)
- [ ] Add `Settled → Published` + `Published → Settling` to `VALID_TRANSITIONS`
- [ ] `isSameMax3dResult` tại `game-max3d/src/rules/draw-result.ts` (iterate enum, exact order)
- [ ] `DrawRepository.publishResult / republishResultAfterSettled (gộp vietlottRef) / updateVietlottRef / triggerResettle`
- [ ] `EntryResettleRepository` (NEW file + barrel export)
- [ ] `LineRepository.upsertLines`: hybrid strategy — `$set` cho business fields + `$setOnInsert` cho `createdAt`
- [ ] DB index `drawId_status_payoutAmount_resettle`

### Phase 2: Use Cases
- [ ] `use-cases/resettle/types.ts` (ResettleContext, EntryReversal types)
- [ ] `use-cases/resettle/prepare-resettle.ts`
- [ ] `use-cases/resettle/enqueue-reversals.ts`
- [ ] `use-cases/resettle/reset-entries-for-resettle.ts`
- [ ] `use-cases/resettle/reset-draw-for-resettle.ts` (`triggerResettle`: Published → Settling)
- [ ] `use-cases/resettle/index.ts` (barrel)
- [ ] `use-cases/draws/publish-result.ts` — ORCHESTRATOR (đã có, verify logic mục 17.2)
- [ ] `use-cases/draws/trigger-resettle.ts` (gate: settledAt != null + status Published)
- [ ] Update `use-cases/draws/index.ts` barrel (KHÔNG export republish/vietlott-ref riêng)
- [ ] Update `use-cases/draws/dto/draw.dto.ts` (settledAt + PublishResultInput có vietlottRef?)
- [ ] Update `get-draw-selector.ts` + DTO

### Phase 3: Worker & SFN
- [ ] `apps/worker-max3d/src/handlers/resettle/*.ts` (4 handlers)
- [ ] `apps/worker-max3d/src/functions/resettle.yml`
- [ ] `apps/worker-max3d/src/step-functions/resettle.asl.json`
- [ ] `apps/worker-max3d/src/step-functions/resettle.ts`
- [ ] Update `apps/worker-max3d/serverless.yml` (functions + stepFunctions)
- [ ] Update `BusinessLockCoordinator` exclusive group `max3d-draw-ops`

### Phase 4: Backoffice API
- [ ] `apps/backoffice/.env.example`: `MAX3D_RESETTLE_SFN_ARN`
- [ ] `apps/backoffice/src/env.ts`: env validation
- [ ] `api/max3d/draws/[drawId]/_lib/schema.ts` (chỉ `publishResultSchema` + `triggerResettleSchema`)
- [ ] `api/max3d/draws/[drawId]/publish-result/route.ts` — endpoint DUY NHẤT (orchestrator)
- [ ] `api/max3d/draws/[drawId]/resettle/route.ts` (NEW)
- [ ] Đảm bảo KHÔNG còn `republish-result/` và `vietlott-ref/` route dirs

### Phase 5: Backoffice UI
- [ ] `draw-actions/publish-result-action.tsx` — form thống nhất (result + vietlottRef), ẩn khi Settling
- [ ] `draw-actions/trigger-resettle-action.tsx` (enable khi Published + settledAt != null)
- [ ] Update `draw-actions/index.ts` (KHÔNG export republish/vietlott-ref action)
- [ ] Update `draw-command-center.tsx` (conditional buttons theo status + settledAt)
- [ ] Update `_lib/use-operations.ts` (usePublishResult + useTriggerResettle; bỏ 2 hook cũ)
- [ ] Update `_lib/sections/draw-management/index.tsx` (mount modals, bỏ state vietlottRef riêng)

### Phase 6: Audit & Permissions
- [ ] Add permissions: `max3d:operations:publish-result`, `max3d:operations:resettle`
- [ ] Audit log events (4 events — publish-result gộp action field)
- [ ] EventBridge rule cho SFN status change (optional)

### Phase 7: Tests & QA
- [ ] Unit tests (7 use case test files)
- [ ] Integration test resettle e2e
- [ ] Manual QA 5 scenarios trên staging
- [ ] Smoke test production với 1 draw thực tế

---

## 17. Tham khảo

- `.cursor/plans/bingo18-resettle.plan.md` — blueprint chính, mọi quyết định mirror từ đây
- `.cursor/plans/keno-resettle.plan.md` — reference Keno pattern (no jackpot, giống Max3D)
- `apps/worker-bingo18/src/step-functions/resettle.asl.json` — ASL template
- `packages/game-bingo18-application/src/use-cases/resettle/` — use case templates
- `packages/game-bingo18-application/src/infras/repos/entry-resettle-repo.ts` — repo template

### 17.1 Pattern BẮT BUỘC khi thiết kế resettle cho game khác

Khi viết plan resettle cho game mới (Lotto535, Mega645, Power655, Max3D Pro, ...), các pattern sau **PHẢI** tuân thủ:

#### A. `LineRepository.upsertLines` — hybrid `$set` + `$setOnInsert`

**Không bao giờ** dùng `$set: doc` cho toàn bộ document. Phải tách `createdAt` ra `$setOnInsert`:

```typescript
async upsertLines(lines: Array<Omit<TicketLineDoc, "_id">>): Promise<void> {
  if (lines.length === 0) return;

  const ops = lines.map((doc) => {
    const { createdAt, ...rest } = doc;
    return {
      updateOne: {
        filter: { entryId: doc.entryId, lineIndex: doc.lineIndex },
        update: {
          $set: rest,                       // business fields — overwrite OK khi resettle
          $setOnInsert: { createdAt },      // immutable timestamp
        },
        upsert: true,
      },
    };
  });

  for (const batch of chunk(ops, BULK_CHUNK_SIZE)) {
    await this.bulkWrite(batch, { ordered: false });
  }
}
```

**Lý do**:

| Field | Modifier | Tại sao |
|---|---|---|
| Business (`matchResult`, `triplets`/`numbers`, `payout`, ...) | `$set` | Resettle re-build lines theo drawResult mới → BẮT BUỘC overwrite. Nếu `$setOnInsert` → stale → dispatch sai. |
| `createdAt` | `$setOnInsert` | Audit-only. Settle retry sau crash giữa `upsertLines` và `bulkSettleEntries` sẽ gọi `upsertLines` lần 2 với `now2 ≠ now1`. Dùng `$set` sẽ refresh `createdAt` — phá vỡ semantic "thời điểm tạo line". |

**Áp dụng cho tất cả game**: Keno, Lotto535, Mega645, Power655, Max3D, Max3D Pro, Bingo18.

#### B. `EntryRepository.bulkSettleEntries` — atomic per-entry filter

Filter `status = "scheduled"` để đảm bảo entry đã settled không bị update lần 2 trong cùng SFN run. Resettle sẽ reset `status` → `Scheduled` qua `EntryResettleRepository.resetEntriesForResettle` trước khi nested Settle SFN chạy.

#### C. `payoutTx` UUIDv7 sinh mới mỗi lần settle

Khi resettle re-settle entry thắng, `settle-entries` sinh `payoutTx` mới. UUIDv7 monotonic theo time → tự nhiên > cursor cũ → `getWinningEntriesForDispatch` không skip nhầm. Outbox unique index trên `tx` reject duplicates nếu cũ chưa được clear.

#### D. `EntryReversal` snapshot field — chỉ ghi 1 lần

`bulkSetReversal` dùng `$setOnInsert` semantics qua condition: chỉ set khi `reversal` chưa tồn tại. `FinalizeSettle` (cả flow settle thường lẫn resettle) GIỮ NGUYÊN field `reversal` — không clear. Audit trail vĩnh viễn.

#### E. `settledAt` là high-water mark immutable

`DrawDoc.settledAt` set lần đầu khi finalize-settle. Resettle KHÔNG cập nhật field này (dùng `version` để track resettle generations). UI dùng `settledAt != null` (KHÔNG dùng status) để biết draw đã từng settled và gate Resettle action.

---

### 17.2 Pattern BẮT BUỘC — "Sửa kết quả" UI thống nhất (đã triển khai cho Max3D/Max3DPro/Keno/Bingo18)

> Đây là quy tắc **chốt** cho phần UI/orchestrator. Game jackpot mới (Lotto535, Mega645,
> Power655) PHẢI tuân theo, KHÔNG quay lại thiết kế tách 3 endpoint cũ.

#### Nguyên tắc

1. **UI có 1 form duy nhất** ("Sửa kết quả") cho mọi status. Form luôn render cả ô result
   lẫn ô vietlottRef. Không có modal riêng cho republish/vietlottRef.
2. **1 endpoint duy nhất** `PUT /api/{game}/draws/:drawId/publish-result` nhận
   `{ result, vietlottRef? }`.
3. **1 use case orchestrator** `PublishResultUseCase` tự quyết định hành động dựa trên
   `draw.settledAt` (high-water mark) + so sánh result cũ vs mới.
4. **Ẩn nút "Sửa kết quả" khi status = `Settling`** (đang kết sổ).
5. **Trigger Resettle** là action riêng, chỉ enable khi `status = Published` AND
   `settledAt != null` (đã sửa result post-settle xong).

#### So sánh result — domain rule `isSame{Game}Result`

Đặt tại `packages/game-{game}/src/rules/draw-result.ts`, export qua `rules/index.ts`.
So sánh **theo thứ tự, element-by-element** (kết quả lưu đúng thứ tự nhập, KHÔNG sort).
Với game có prize tiers, iterate qua **enum values** (`BASIC_PRIZE_TIER_VALUES` /
`BASIC_TIER_PRIORITY`), KHÔNG hardcode plaintext tier names.

```typescript
// Ví dụ Max3D (có 4 tier): iterate qua enum, KHÔNG dùng "special"/"first"... plaintext.
import { BASIC_PRIZE_TIER_VALUES } from "../entities/enums";
import type { Max3dDrawResult } from "../entities/draw-result";

const sameArray = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]); // exact order

export function isSameMax3dResult(a: Max3dDrawResult, b: Max3dDrawResult): boolean {
  return BASIC_PRIZE_TIER_VALUES.every((tier) => sameArray(a[tier], b[tier]));
}
```

- Keno: so `string[]` winningNumbers (không tier).
- Bingo18: so `number[]` (3 viên xúc xắc, exact order).
- Lotto/Mega/Power: so mảng số trúng theo thứ tự lưu (verify game không sort trước khi lưu;
  nếu sort thì so sau khi sort lại y hệt cách lưu).

#### Orchestrator — `PublishResultUseCase` (template thực tế từ Max3D)

```typescript
const PUBLISHABLE_STATUSES = new Set<string>([
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settled,
]);

export class PublishResultUseCase extends NextApiUseCase<PublishResultInput, PublishResultOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: PublishResultInput): Promise<PublishResultOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    if (!PUBLISHABLE_STATUSES.has(draw.status)) {
      throw new AppException("DRAW_INVALID_TRANSITION",
        `Không thể publish kết quả – draw ở trạng thái "${draw.status}".`);
    }

    const publishedAt = nowVN();
    // High-water mark — KHÔNG dùng status để biết đã từng settle.
    const hasSettledBefore = Boolean(draw.settledAt);

    // Nhánh 1: chưa từng settle → publish bình thường.
    if (!hasSettledBefore) return this.publish(input, publishedAt);

    // Nhánh 2: đã settle ⇒ result chắc chắn tồn tại → so sánh trực tiếp (KHÔNG check
    // `draw.result ? ... : false` thừa, vì FinalizeSettle yêu cầu có result).
    const resultUnchanged = isSameMax3dResult(draw.result!, input.result);

    if (resultUnchanged) {
      // Chỉ sửa metadata vietlottRef → KHÔNG resettle, giữ nguyên status + data settle.
      if (input.vietlottRef) {
        const updated = await this.drawRepo.updateVietlottRef(input.drawId, input.vietlottRef);
        if (!updated) throw AppException.internal(`Cập nhật Vietlott Ref kỳ ${input.drawId} thất bại.`);
      }
      return this.toOutput(input, draw.status, draw.result!.publishedAt ?? publishedAt);
    }

    // Result CÓ đổi sau settle.
    if (draw.status === DrawStatus.Settled) {
      // settled → published + $unset data settle + ghi result + vietlottRef trong CÙNG 1 query.
      // Tránh 2 round-trip: KHÔNG tách republish rồi updateVietlottRef riêng.
      const updated = await this.drawRepo.republishResultAfterSettled(
        input.drawId,
        { ...input.result, publishedAt },
        input.vietlottRef,
      );
      if (!updated) throw AppException.internal(`Sửa kết quả kỳ ${input.drawId} thất bại.`);
      return this.toOutput(input, DrawStatus.Published, publishedAt);
    }

    // status === Published (đang chờ resettle): ghi đè result + vietlottRef, giữ Published.
    return this.publish(input, publishedAt);
  }

  private async publish(input: PublishResultInput, publishedAt: Date): Promise<PublishResultOutput> {
    const updated = await this.drawRepo.publishResult(
      input.drawId, { ...input.result, publishedAt }, input.vietlottRef,
    );
    if (!updated) throw AppException.internal(`Publish kết quả kỳ ${input.drawId} thất bại.`);
    return this.toOutput(input, DrawStatus.Published, publishedAt);
  }

  private toOutput(input: PublishResultInput, status: string, publishedAt: Date): PublishResultOutput {
    return {
      drawId: input.drawId,
      status,
      result: { ...input.result, publishedAt: publishedAt.toISOString() },
    };
  }
}
```

#### 2 tối ưu quan trọng (đã áp dụng)

1. **Bỏ check thừa khi đã settle**: `isSameMax3dResult(draw.result!, input.result)` —
   KHÔNG cần `draw.result ? ... : false`. Đã settle ⇒ result luôn tồn tại.
2. **Gộp vietlottRef vào `republishResultAfterSettled`**: khi result đổi sau settle, ghi
   `result` + `vietlottRef` trong **cùng 1 `$set`**. Chỉ gọi `updateVietlottRef` riêng khi
   result **không** đổi. Tránh 2 query thừa mỗi lần staff republish (thường sửa cả 2 cùng lúc).

---

## 18. Confirm checklist với user (đã confirm)

- ✅ **Lines strategy**: hybrid `$set` + `$setOnInsert` — `$set` cho business fields (overwrite được khi resettle), `$setOnInsert` cho `createdAt` (immutable kể cả khi settle retry sau crash). Pattern bắt buộc cho mọi game.
- ✅ **Reports handling**: KHÔNG đổi — reports đã idempotent.
- ✅ **UI thống nhất**: 1 form "Sửa kết quả" + 1 endpoint `publish-result` + 1 orchestrator
  cho mọi status (initial publish / republish kéo resettle / update vietlottRef). **Bỏ**
  thiết kế tách 3 endpoint cũ. Xem mục 17.2.
- ✅ **So sánh result**: dùng phương án A (element-by-element, exact order) qua domain rule
  `isSame{Game}Result`. Verify game không sort trước khi lưu.
- ✅ **Optimize orchestrator**: (1) bỏ check `draw.result ? ... : false` thừa khi đã settle;
  (2) gộp vietlottRef vào `republishResultAfterSettled` (1 query) khi result đổi.
- ✅ **PayoutTx dispatch filter**: dùng UUIDv7 mới — tự nhiên > cursor cũ. Outbox unique `tx` reject duplicates.

---

> **Chú ý implementation**: Plan này đã đầy đủ chi tiết. Khi implement, đọc kỹ Bingo18 plan để mirror chính xác conventions (naming, log format, error handling). Mọi câu hỏi mới phát sinh trong quá trình code → check Bingo18 implementation thực tế trước, đó là source of truth.