# Dispatch Payout & Refund — Kiến trúc tập trung vs Per-game Worker

> **Status**: TODO — chưa implement.
> **Priority**: Medium-High — nên làm trước khi scale lên nhiều tenant.
> **Estimated effort**: Phase 0 ~2 ngày, Phase 1 ~5-7 ngày, Phase 2 ~3-5 ngày.

---

## 1. Hiện trạng chi tiết

### 1.1 Settle → Dispatch flow (Step Function)

```
[Settle Step Function — per game, ví dụ mega645]

Input: { drawId }
  │
  ▼
PrepareSettle ──→ SettleEntries (loop, batch=500)
  │                     │
  ▼                     ▼
CalculateFinancials ──→ CheckJackpotWinner ──→ SyncTicketSummaries (loop)
  │
  ▼
BuildSettleReport ──→ PublishSettleDaily ──→ PublishPlayerDaily
  │
  ▼
FinalizeSettle          ← settle nội bộ DONE tại đây
  │
  ▼
DispatchPayouts ◄──────────────────────────┐
  │                                         │
  ▼                                         │
CheckPayoutDone ──→ done=false → PayoutWait (5s) ─┘
  │
  └─→ done=true → PayoutComplete (End)
  └─→ Catch ALL → PayoutFailed (End, admin retry thủ công)
```

Step Function definition (ASL) — mọi game dùng pattern giống hệt:

```typescript
// apps/worker-mega645/src/step-functions/settle.ts (lines 229-270)
DispatchPayouts: {
  Type: "Task",
  Resource: lambdaArn("settle-dispatch-payouts"),
  Arguments: "{% $settleCtx %}",
  Assign: { payoutResult: "{% $states.result %}" },
  Next: "CheckPayoutDone",
  Retry: LAMBDA_RETRY,  // 3 attempts, interval 10s, backoff 2.0x
  Catch: [{ ErrorEquals: ["States.ALL"], Next: "PayoutFailed" }],
},
CheckPayoutDone: {
  Type: "Choice",
  Choices: [{ Condition: "{% $payoutResult.done %}", Next: "PayoutComplete" }],
  Default: "PayoutWait",
},
PayoutWait: { Type: "Wait", Seconds: 5, Next: "DispatchPayouts" },
PayoutComplete: { Type: "Pass", End: true },
PayoutFailed: { Type: "Pass", End: true },
```

### 1.2 Void → Dispatch Refund flow (tương tự)

```
FinalizeVoid → DispatchRefunds (loop 5s) → CheckRefundDone → RefundComplete/RefundFailed
```

### 1.3 Lambda handler — thin wrapper (giống hệt 7 games)

```typescript
// apps/worker-mega645/src/handlers/settle/dispatch-payouts.ts
import { DispatchPayoutBatchUseCase } from "@megawin/game-mega645-application/use-cases/payout";
const useCase = new DispatchPayoutBatchUseCase();
export async function handler(event: DispatchPayoutBatchInput) {
  return useCase.run(event);
}
```

### 1.4 Use Case — dispatch logic (giống hệt 7 games)

```typescript
// packages/game-mega645-application/src/use-cases/payout/dispatch-payout.ts
// Flow mỗi lần gọi:
// 1. Query getPendingPayoutEntries(drawId, 200)
// 2. Filter entries vượt MAX_RETRY_COUNT=10 → skip
// 3. Group by tenantId
// 4. Per tenant: resolve TenantGatewayClient từ cache
// 5. Chunk entries thành batches (50 items/batch)
// 6. Gọi gateway.batchPayout({ items }) → xử lý response per-item
// 7. Mark batchMarkPayoutDispatched(succeededIds) hoặc batchMarkPayoutFailed(failedIds)
// 8. Count remaining → done = (remaining === 0)
```

**Điểm khác biệt duy nhất giữa 7 games**:

| Khác biệt     | Ví dụ mega645                           | Ví dụ keno                           |
| ------------- | --------------------------------------- | ------------------------------------ |
| `GameProduct` | `GameProduct.Mega645`                   | `GameProduct.Keno`                   |
| Description   | `"Trả thưởng Mega 6/45 kỳ..."`          | `"Trả thưởng Keno kỳ..."`            |
| Import path   | `@megawin/game-mega645-application/...` | `@megawin/game-keno-application/...` |
| Log prefix    | `[dispatch-payout]`                     | `[dispatch-payout-keno]`             |

Logic dispatch, retry, batching, error handling — **100% giống nhau**.

### 1.5 Entry Repository — dispatch methods (giống hệt 7 games)

```typescript
// packages/game-mega645-application/src/infras/repos/entry-repo.ts

// Payout dispatch methods:
getPendingPayoutEntries(drawId, limit); // query entries cần dispatch
countPendingPayoutEntries(drawId); // count remaining
batchMarkPayoutDispatched(entryIds); // batch update status
batchMarkPayoutFailed(entryIds, error); // batch update failed + increment retry count
markPayoutDispatched(entryId); // single update
markPayoutFailed(entryId, error); // single update

// Refund dispatch methods:
getPendingRefundEntries(drawId, limit);
markRefundDispatched(entryId); // single update (không có batch!)
markRefundFailed(entryId, error); // single update (không có batch!)
```

**Không có shared interface** — mỗi game copy-paste riêng cùng method signatures.

### 1.6 Serverless function definitions

```yaml
# apps/worker-mega645/src/functions/settle.yml
settle-dispatch-payouts:
  handler: src/handlers/settle/dispatch-payouts.handler
  timeout: 900 # 15 phút — phòng batch lớn + tenant API chậm

# apps/worker-mega645/src/functions/void.yml
void-dispatch-refunds:
  handler: src/handlers/void/dispatch-refunds.handler
  timeout: 900
```

### 1.7 Retry layers hiện tại (4 lớp chồng nhau)

| Layer         | Cơ chế                  | Config                                                                |
| ------------- | ----------------------- | --------------------------------------------------------------------- |
| HTTP Client   | Exponential backoff     | 3 attempts, 500ms base, retryable: 0/408/429/502/503/504              |
| Use Case      | Entry-level retry count | Payout: skip khi `payoutRetryCount >= 10`. Refund: **không giới hạn** |
| Step Function | Lambda retry            | `LAMBDA_RETRY`: 3 attempts, 10s interval, 2.0x backoff                |
| Step Function | Loop retry              | `done=false → Wait 5s → gọi lại`. Failed entries tự quay lại pending  |

### 1.8 Tổng files bị duplicate

| Loại file                        | Số lượng         | Nội dung                           |
| -------------------------------- | ---------------- | ---------------------------------- |
| `dispatch-payout.ts` (use case)  | 7                | Logic dispatch payout — giống nhau |
| `dispatch-refunds.ts` (use case) | 7                | Logic dispatch refund — giống nhau |
| Lambda handler (payout)          | 7                | 3-line wrapper                     |
| Lambda handler (refund)          | 7                | 3-line wrapper                     |
| Step Function states (payout)    | 7                | 5 ASL states giống nhau            |
| Step Function states (refund)    | 7                | 5 ASL states giống nhau            |
| Serverless YML entries           | 14               | Function definitions               |
| Entry repo dispatch methods      | 7                | ~200 lines mỗi file                |
| **Tổng**                         | **63 locations** | Sửa 1 chỗ = phải sửa 7-14 chỗ      |

---

## 2. Rủi ro với kiến trúc hiện tại

### 2.1 Tenant overwhelm (CRITICAL khi multi-tenant)

Keno settle **mỗi 5 phút**. Các game khác settle theo lịch riêng (18h, 18h15, 18h30...).
Peak time: nhiều games settle gần nhau.

**Kịch bản**: 3 games settle đồng thời cho cùng tenant → 3 Lambda đồng thời dispatch:

- Mỗi Lambda: query 200 entries → chunk 50 → 4 HTTP calls
- Tổng: 12 concurrent HTTP calls tới cùng tenant server
- Tenant nhỏ (1-2 vCPU) → timeout cascade → tất cả fail → retry storm

**Không có cơ chế** rate limiting cross-game. Mỗi Lambda hoạt động độc lập.

### 2.2 Settle pipeline stuck

Settle nội bộ xong sau FinalizeSettle (~30s-2min). Dispatch có thể kéo dài **hàng giờ** nếu
tenant down. Step Function vẫn "Running" → monitoring confusion.

Hậu quả thực tế:

- Admin thấy "settle mega645 draw 2026-04-10.095 đang chạy 3 tiếng" → panic
- Thực tế: settle xong từ 3 tiếng trước, chỉ dispatch đang stuck
- Không thể retry dispatch **độc lập** — phải can thiệp Step Function execution

### 2.3 Cost waste

Tenant down 2 ngày → Step Function loop: `Lambda (15s) → Wait (5s) → Lambda (15s) → ...`

- 1 cycle = 20s → 4,320 cycles/day
- Lambda cost: 4,320 × 15s × 128MB ≈ $0.13/day/draw/game
- 7 games × 365 draws/game = $300+/year chỉ cho retry loop

### 2.4 Refund retry vô hạn

Refund dispatch **không có MAX_RETRY_COUNT**. Nếu tenant permanently down:

- Step Function loop mãi → Lambda cost tích luỹ
- Không có alert mechanism — chỉ PayoutFailed catch, không có RetryExhausted

### 2.5 Inconsistency risk

Cần thêm circuit breaker → sửa 14 files. Quên 1 game = bug chỉ ở game đó.
Cần thêm logging → sửa 14 files. Quên 1 game = thiếu audit trail cho game đó.

---

## 3. Giải pháp — Phase 0: Deduplicate dispatch code

> **Effort**: ~2 ngày. **Risk**: Zero — không thay đổi kiến trúc.

### 3.1 Tạo shared dispatch interface + generic use case

```
packages/game-core-application/src/
└── use-cases/
    └── dispatch/
        ├── types.ts                        ← DispatchableEntryRepository interface
        ├── generic-dispatch-payout.ts      ← GenericDispatchPayoutUseCase
        ├── generic-dispatch-refund.ts      ← GenericDispatchRefundUseCase
        └── index.ts
```

### 3.2 DispatchableEntryRepository interface

```typescript
// packages/game-core-application/src/use-cases/dispatch/types.ts

export interface DispatchableEntryRepository {
  getPendingPayoutEntries(drawId: string, limit: number): Promise<DispatchableEntry[]>;
  countPendingPayoutEntries(drawId: string): Promise<number>;
  batchMarkPayoutDispatched(entryIds: string[]): Promise<number>;
  batchMarkPayoutFailed(entryIds: string[], error: string): Promise<number>;

  getPendingRefundEntries(drawId: string, limit: number): Promise<DispatchableEntry[]>;
  markRefundDispatched(entryId: string): Promise<boolean>;
  markRefundFailed(entryId: string, error: string): Promise<boolean>;
}

export interface DispatchableEntry {
  id: string;
  tenantId: string;
  accountId: string;
  drawId: string;
  payout?: {
    payoutAmount: number;
    payoutTx?: string;
    payoutRetryCount?: number;
  };
  voidInfo?: {
    refundAmount: number;
    refundTx: string;
  };
  entrySummary?: {
    ticketNo?: string;
  };
}

export interface DispatchConfig {
  gameKey: string;
  gameName: string;
}
```

### 3.3 Generic dispatch use case

```typescript
// packages/game-core-application/src/use-cases/dispatch/generic-dispatch-payout.ts

export class GenericDispatchPayoutUseCase extends InternalUseCase<
  DispatchPayoutBatchInput,
  DispatchPayoutBatchResult
> {
  constructor(
    private readonly entryRepo: DispatchableEntryRepository,
    private readonly config: DispatchConfig,
  ) {
    super();
  }

  protected async execute(input) {
    // Logic hiện tại — copy từ mega645, dùng this.config.gameKey thay GameProduct.Mega645
    // dùng this.config.gameName trong description
  }
}
```

### 3.4 Game-specific wrapper (3-5 dòng)

```typescript
// packages/game-mega645-application/src/use-cases/payout/dispatch-payout.ts (SAU refactor)

import { GenericDispatchPayoutUseCase } from "@megawin/game-core-application/use-cases/dispatch";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GameProduct } from "@megawin/game-core/entities";

export class DispatchPayoutBatchUseCase extends GenericDispatchPayoutUseCase {
  constructor() {
    super(new EntryRepository(), { gameKey: GameProduct.Mega645, gameName: "Mega 6/45" });
  }
}

// Re-export types cho backward compatibility
export type {
  DispatchPayoutBatchInput,
  DispatchPayoutBatchResult,
} from "@megawin/game-core-application/use-cases/dispatch";
```

### 3.5 Checklist Phase 0

- [ ] Tạo `DispatchableEntryRepository` interface
- [ ] Tạo `DispatchableEntry` interface
- [ ] Tạo `GenericDispatchPayoutUseCase`
- [ ] Tạo `GenericDispatchRefundUseCase`
- [ ] Refactor 7 game `dispatch-payout.ts` → thin wrapper
- [ ] Refactor 7 game `dispatch-refunds.ts` → thin wrapper
- [ ] Verify 7 game `EntryRepository` implement `DispatchableEntryRepository`
- [ ] Type-check: `pnpm check-types` across all affected packages
- [ ] Lambda handlers không thay đổi — backward compatible

---

## 4. Giải pháp — Phase 1: Centralized Dispatch Worker

> **Effort**: ~5-7 ngày. **Prerequisite**: Phase 0 done.

### 4.1 Architecture tổng quan

```
[Settle Step Function per game]           [Void Step Function per game]
  1. PrepareSettle                          1. PrepareVoid
  2. SettleEntries                          2. VoidEntries
  3. CalculateFinancials                    3. SyncTicketSummaries
  4. ...                                    4. ...
  5. FinalizeSettle                         5. FinalizeVoid
  6. EnqueueDispatch ← NEW                  6. EnqueueDispatch ← NEW
  └─ END (settle done!)                     └─ END (void done!)

             │                                        │
             ▼                                        ▼
     ┌────────────────────────────────────────────────────┐
     │           SQS Queue: dispatch-queue                 │
     │  { gameKey, drawId, type: "payout"|"refund" }       │
     │                                                     │
     │  Visibility timeout: 16 min (> Lambda timeout 15m)  │
     │  Message retention: 14 days                         │
     │  Redrive policy: maxReceiveCount = 5 → DLQ          │
     └────────────────────────┬───────────────────────────┘
                              │
                              ▼
     ┌────────────────────────────────────────────────────┐
     │   Lambda: dispatch-worker (SQS trigger)             │
     │   timeout: 900s, reserved concurrency: 10           │
     │                                                     │
     │   1. Parse message { gameKey, drawId, type }        │
     │   2. Resolve EntryRepository từ registry            │
     │   3. Run GenericDispatchPayout/RefundUseCase         │
     │   4. done=true → message auto-delete                │
     │      done=false → throw → SQS re-deliver sau 5min   │
     └────────────────────────────────────────────────────┘
                              │
                              │ maxReceiveCount exceeded
                              ▼
     ┌────────────────────────────────────────────────────┐
     │   SQS DLQ: dispatch-dlq                             │
     │   → CloudWatch Alarm → Alert ops team               │
     │   → Admin retry qua backoffice                      │
     └────────────────────────────────────────────────────┘
```

### 4.2 SQS Message schema

```typescript
interface DispatchMessage {
  gameKey: GameKey; // "keno" | "mega645" | "power655" | ...
  drawId: string; // "2026-04-10.095"
  type: "payout" | "refund";
  enqueuedAt: string; // ISO 8601 — tracking delay
  enqueuedBy: string; // "settle-step-function" | "admin-retry" | "reconciliation"
}
```

### 4.3 Entry Repository Registry

```typescript
// apps/worker-dispatch/src/registry.ts

import { KenoEntryRepository } from "@megawin/game-keno-application/infras/repos";
import { Mega645EntryRepository } from "@megawin/game-mega645-application/infras/repos";
// ... 7 games

const entryRepoRegistry: Record<GameKey, () => DispatchableEntryRepository> = {
  keno: () => new KenoEntryRepository(),
  lotto535: () => new Lotto535EntryRepository(),
  mega645: () => new Mega645EntryRepository(),
  power655: () => new Power655EntryRepository(),
  max3d: () => new Max3dEntryRepository(),
  max3dpro: () => new Max3dproEntryRepository(),
  bingo18: () => new Bingo18EntryRepository(),
};
```

### 4.4 EnqueueDispatch — bước cuối Step Function

```typescript
// Thay thế DispatchPayouts state trong settle Step Function

EnqueueDispatch: {
  Type: "Task",
  Resource: "arn:aws:states:::sqs:sendMessage",
  Parameters: {
    QueueUrl: "${DispatchQueueUrl}",
    MessageBody: {
      "gameKey": "mega645",
      "drawId.$": "$$.Execution.Input.drawId",
      "type": "payout",
      "enqueuedAt.$": "$$.State.EnteredTime",
      "enqueuedBy": "settle-step-function"
    }
  },
  End: true
}
```

### 4.5 Worker app structure

```
apps/worker-dispatch/                     ← NEW app
├── src/
│   ├── handlers/
│   │   └── dispatch.ts                   ← SQS Lambda handler
│   ├── registry.ts                       ← GameKey → EntryRepository mapping
│   └── functions/
│       └── dispatch.yml
├── serverless.yml
├── package.json
└── tsconfig.json
```

### 4.6 Checklist Phase 1

- [ ] Tạo SQS queue `dispatch-queue` + DLQ `dispatch-dlq` (Serverless/CDK)
- [ ] Tạo `apps/worker-dispatch/` app
- [ ] Implement `dispatch.ts` Lambda handler (SQS trigger)
- [ ] Implement `registry.ts` (gameKey → EntryRepository)
- [ ] Modify 7 settle Step Functions: thay DispatchPayouts states → EnqueueDispatch
- [ ] Modify 7 void Step Functions: tương tự
- [ ] Setup CloudWatch Alarm trên DLQ message count > 0
- [ ] Test end-to-end: settle → SQS → dispatch worker → tenant API
- [ ] Parallel run: giữ cả 2 path (Step Function + SQS) 1 tuần, so sánh kết quả
- [ ] Remove old dispatch states từ Step Functions sau khi verified

---

## 5. Giải pháp — Phase 2: Tenant Rate Limiting + Smart Retry

> **Effort**: ~3-5 ngày. **Prerequisite**: Phase 1 done.

### 5.1 Global concurrency control per tenant

```typescript
// apps/worker-dispatch/src/rate-limiter.ts

const MAX_CONCURRENT_PER_TENANT = 3;

// In-memory counter (per Lambda instance) + DynamoDB for cross-instance
// Hoặc đơn giản hơn: SQS FIFO queue per tenant (message group ID = tenantId)
```

**Option A — SQS FIFO** (đơn giản nhất):

- MessageGroupId = tenantId → SQS tự serialize messages per tenant
- MaxConcurrency trên Lambda SQS trigger = 3 → tối đa 3 concurrent per tenant

**Option B — DynamoDB counter** (linh hoạt hơn):

- Atomic counter per tenantId
- acquireSlot() / releaseSlot()
- Cho phép configure per-tenant limit

### 5.2 Exponential backoff

Thay vì Step Function Wait 5s cố định:

```
Lần 1: 1 phút
Lần 2: 2 phút
Lần 3: 4 phút
Lần 4: 8 phút
Lần 5: 16 phút → DLQ
```

SQS visibility timeout tự tăng qua `ChangeMessageVisibility` API.

### 5.3 Circuit breaker per tenant

```typescript
// Khi tenant liên tục fail (> 80% error rate trong 10 phút):
// 1. Pause dispatch cho tenant đó
// 2. Sau 5 phút → thử 1 request (half-open)
// 3. Thành công → resume. Thất bại → pause thêm 10 phút
// 4. Alert ops team
```

### 5.4 Checklist Phase 2

- [ ] Implement tenant rate limiting (SQS FIFO hoặc DynamoDB counter)
- [ ] Implement exponential backoff (SQS visibility timeout)
- [ ] Implement circuit breaker per tenant
- [ ] Add MAX_RETRY_COUNT cho refund dispatch (hiện không có)
- [ ] CloudWatch dashboard: pending messages, DLQ count, per-tenant error rate
- [ ] Alert: entries stuck > 1 hour, DLQ count > 0

---

## 6. So sánh kiến trúc

| Tiêu chí                  | Per-game hiện tại | Phase 0 (deduplicate)   | Phase 1 (centralized) | Phase 1+2 (full)          |
| ------------------------- | ----------------- | ----------------------- | --------------------- | ------------------------- |
| Code duplication          | 63 locations      | 2 generic + 14 wrappers | 1 worker app          | 1 worker app              |
| Settle ↔ Dispatch         | Coupled           | Coupled                 | **Decoupled**         | **Decoupled**             |
| Tenant rate limit         | Không             | Không                   | Không                 | **Global per-tenant**     |
| Retry control             | 5s fixed loop     | 5s fixed loop           | SQS re-delivery       | **Exponential backoff**   |
| DLQ / Alert               | Không             | Không                   | **SQS DLQ**           | **DLQ + circuit breaker** |
| Cross-game visibility     | 7 dashboards      | 7 dashboards            | **1 SQS dashboard**   | **Full dashboard**        |
| Deploy cost               | 7 workers         | 7 workers               | **1 worker**          | **1 worker**              |
| Lambda cost (tenant down) | Loop 24h          | Loop 24h                | **SQS re-deliver**    | **Backoff + pause**       |
| Complexity                | Thấp              | Thấp                    | Trung bình            | Trung bình-cao            |
| Risk                      | N/A               | Zero                    | Trung bình            | Trung bình                |

---

## 7. Rủi ro khi tách và mitigation

| Rủi ro                        | Mức độ              | Mitigation                                                                          |
| ----------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| SQS message lost              | Rất thấp (11 nines) | DLQ + daily reconciliation scan                                                     |
| Worker crash giữa batch       | Trung bình          | Entry-level idempotency (payoutTx/refundTx), SQS visibility timeout auto re-deliver |
| Ordering                      | N/A                 | Dispatch không cần ordered, SQS Standard queue                                      |
| Complexity tăng               | Trung bình          | Offset: 63 locations → 1 worker, better monitoring                                  |
| Game-specific logic tương lai | Thấp                | DispatchConfig extensible, hook/strategy pattern                                    |
| Migration risk                | Trung bình          | Parallel run: cả 2 path chạy 1 tuần, so sánh kết quả                                |
| Cross-game dependency         | Trung bình          | worker-dispatch depend on 7 game-application packages                               |

---

## 8. Kết luận

**Phase 0 nên làm ngay** — zero risk, giảm 63 duplicate locations, dễ maintain.

**Phase 1 nên làm trước khi có > 5 tenants production** — tenant overwhelm là rủi ro lớn nhất.

**Phase 2 nên làm khi có tenant thật** — cần data thực để tune rate limit + backoff.

Rủi ro lớn nhất nếu giữ kiến trúc hiện tại: **20-50 tenants × 7 games × settle đồng thời
→ dispatch storm overwhelm tenant servers**, không có cơ chế kiểm soát.
