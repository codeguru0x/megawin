---
name: ""
overview: ""
todos: []
isProject: false
---

# Tenant Dispatch — Tách 2 lane Main / Retry

> Plan này **chỉ** mô tả việc tách worker dispatch thành 2 lane (main / retry)
> và các thay đổi đi kèm trong domain `tenant-dispatch`.
>
> Cơ chế **distributed lock chung cho toàn hệ thống** (Mongo-based) được tách
> sang plan riêng — xem `worker_lock_infrastructure.plan.md`.
>
> Ở plan này, để chống race Lambda overlap, dùng `**reservedConcurrency: 1`**
> làm hàng rào duy nhất (đủ tốt cho giai đoạn đầu; sẽ gia cố bằng lock sau).

---

## 0. Vấn đề & Quyết định

### Vấn đề hiện tại

- Worker duy nhất `worker-tenant-dispatch` poll `getPendingBatch(500)` mỗi 1 phút.
- Nếu 1 tenant down → chunks gọi tenant đó timeout → block các tenant khỏe khác.
- Order đã retry nhiều lần (tenant có vấn đề kéo dài) vẫn chia sẻ lane với
order mới → main lane bị "ô nhiễm" bởi orders cũ, tăng latency dispatch cho
orders vừa enqueue xong.

### Quyết định

Tách thành **2 lane** phân biệt theo field `retryCount`:


| Lane             | Filter                           | Schedule          | Query limit | Timeout | Reserved concurrency |
| ---------------- | -------------------------------- | ----------------- | ----------- | ------- | -------------------- |
| **Main** (fresh) | `retryCount: { $exists: false }` | `rate(1 minute)`  | 500         | 60s     | 1                    |
| **Retry**        | `retryCount: { $exists: true }`  | `rate(3 minutes)` | 100         | 300s    | 1                    |


**Quy ước `retryCount`:**

- Order mới enqueue: **KHÔNG có field** `retryCount` (builder không set).
- Lần fail đầu tiên: `$inc retryCount` → field xuất hiện với giá trị `1`.
- Các lần fail sau: `$inc retryCount` → 2, 3, ...
- `retryCount` = **số lần đã fail** (không phải số attempts).

**Tính mutually exclusive & complete:**


| Trạng thái field   | Main match? | Retry match? |
| ------------------ | ----------- | ------------ |
| Missing (fresh)    | ✅           | ❌            |
| `1`, `2`, `3`, ... | ❌           | ✅            |


→ Union = tất cả pending orders. Intersection = rỗng.

### Admin retry → Không còn cần thiết

Với logic mới "retry vô hạn cho mọi lỗi", worker tự retry đến khi thành công.
`RetryBatchUseCase` cũ (reset `Failed → Pending`) **bị xoá hoàn toàn** vì:

- Không còn status `Failed` (xoá ở §9).
- Không còn tình huống nào admin phải "bắt đầu lại" manual — worker tự lo.

Admin chỉ còn 1 action duy nhất: **`cancelOrder`** (chuyển sang `Cancelled`) cho
edge case nghiệp vụ quyết định không dispatch nữa.

---

## 1. Không-scope của plan

Các hạng mục **KHÔNG** làm ở plan này (đã bàn nhưng để dịp khác):

- ❌ Distributed lock Mongo (sang plan. `worker_lock_infrastructure.plan.md`).
- ❌ `Promise.all` parallel tenants trong use case.
- ❌ Circuit breaker per tenant.

**Có trong plan (thêm từ round thảo luận sau):**

- ✅ Retry vô hạn (không còn cap `MAX_RETRY_BY_KIND`) cho **mọi** lỗi.
- ✅ Tăng backoff: base `30s`, cap `30 phút`.
- ✅ High-retry-count threshold → UI hiển thị cho staff.
- ✅ Xoá `DispatchOrderStatus.Failed` — không còn path tự động.
- ✅ **Xoá hoàn toàn `RetryBatchUseCase`** + API route `/api/tenant-dispatch/retry-batch` + schema.
- ✅ Normalize mọi error → 1 field `lastError` duy nhất (không tách `lastErrorKind`/`Code`).

**Lý do**: plan này nhỏ, đơn lẻ, dễ review. Các hạng mục trên có thể làm
incremental sau, không phụ thuộc.

---

## 2. Thay đổi file — Checklist

### 2.1. `packages/tenant-dispatch/src/config/constants.ts`

Thêm config riêng cho 2 lane; **xoá** `DISPATCH_QUERY_LIMIT` cũ (đã verify không
ai import).

```typescript
/** Main lane — orders fresh (chưa fail lần nào). */
export const DISPATCH_MAIN_QUERY_LIMIT = 500;
/** Retry lane — orders đã fail ít nhất 1 lần. */
export const DISPATCH_RETRY_QUERY_LIMIT = 100;

/** Soft budget main lane — Lambda timeout 60s, chừa 5s cho flush. */
export const DISPATCH_MAIN_MAX_EXECUTION_MS = 55 * 1000;
/** Soft budget retry lane — Lambda timeout 300s, chừa 15s. */
export const DISPATCH_RETRY_MAX_EXECUTION_MS = 285 * 1000;
```

**Backoff — thay đổi quan trọng:**

```typescript
/** Base cho exponential backoff (giây). Tăng 10→30 để giảm load tenant khi fail. */
export const BACKOFF_BASE_SECONDS = 30;
/** Trần backoff (giây). Tăng 10p→30p để retry thưa hơn khi tenant down dài. */
export const BACKOFF_MAX_SECONDS = 30 * 60;

/**
 * Threshold để báo động "order đang stuck" — KHÔNG phải cap.
 * Order vẫn tiếp tục retry sau threshold này; UI BO hiển thị để staff can thiệp.
 *
 * Với base=30s, cap=30p: ~50 fails ≈ 1 ngày retry liên tục.
 */
export const RETRY_ALERT_THRESHOLD = 50;
```

**XOÁ** `MAX_RETRY_BY_KIND` và mọi reference — không còn cap hữu hạn.

### 2.2. `packages/tenant-dispatch/src/entities/dispatch-order.ts`

Cập nhật JSDoc field `retryCount`:

```typescript
/**
 * Số lần đã **fail** dispatch. Missing = chưa fail lần nào (fresh order).
 *
 * Dùng làm đường phân lane worker:
 * - Main lane (`worker-tenant-dispatch` rate 1 min): `retryCount` missing.
 * - Retry lane (`worker-tenant-dispatch-retry` rate 3 min): `retryCount` >= 1.
 *
 * `$inc retryCount: 1` khi `markAttemptFailed` → field tự xuất hiện sau fail
 * đầu tiên → order tự động chuyển từ main sang retry lane ở lần poll tiếp theo.
 */
retryCount?: number;
```

### 2.3. `packages/tenant-dispatch/src/builders/build-dispatch-order.ts`

**Không đổi.** Builder đã **không** set `retryCount` — đúng với quy ước
"missing = fresh". Chỉ cần verify trong code review.

### 2.4. `packages/tenant-dispatch/src/infras/repos/dispatch-order-repo.ts`

Tách `getPendingBatch` thành 2 methods + 1 helper private:

```typescript
/**
 * Main lane: orders fresh (chưa fail lần nào).
 * Filter: status=Pending, nextAttemptAt<=now, retryCount missing.
 */
async getPendingMainBatch(limit: number): Promise<PendingDispatchOrder[]> {
  const now = new Date();
  return this.queryPendingOrders(
    {
      status: DispatchOrderStatus.Pending,
      nextAttemptAt: { $lte: now },
      retryCount: { $exists: false },
    },
    limit,
  );
}

/**
 * Retry lane: orders đã fail ít nhất 1 lần.
 * Filter: status=Pending, nextAttemptAt<=now, retryCount exists.
 */
async getPendingRetryBatch(limit: number): Promise<PendingDispatchOrder[]> {
  const now = new Date();
  return this.queryPendingOrders(
    {
      status: DispatchOrderStatus.Pending,
      nextAttemptAt: { $lte: now },
      retryCount: { $exists: true },
    },
    limit,
  );
}

private async queryPendingOrders(
  filter: Record<string, unknown>,
  limit: number,
): Promise<PendingDispatchOrder[]> {
  const docs = await this.findManyAsDocuments(filter, {
    sort: { nextAttemptAt: 1 },
    limit,
    projection: { /* giữ nguyên projection hiện tại */ },
  });
  return docs.map((d: any) => ({ /* giữ nguyên mapping hiện tại */ }));
}

/**
 * @deprecated Dùng `getPendingMainBatch` hoặc `getPendingRetryBatch`.
 * Giữ lại 1 release cho backward compat, xoá sau khi callers đổi xong.
 */
async getPendingBatch(limit: number): Promise<PendingDispatchOrder[]> {
  return this.queryPendingOrders(
    {
      status: DispatchOrderStatus.Pending,
      nextAttemptAt: { $lte: new Date() },
    },
    limit,
  );
}
```

**Lưu ý index**: query mới dùng leading `status` + `nextAttemptAt` — index
hiện tại `{ status: 1, nextAttemptAt: 1 }` partial vẫn hoạt động. Filter
`retryCount: { $exists }` sẽ được Mongo apply sau khi dùng index — OK vì sau
filter index số document còn lại đã rất ít.

### 2.5. `packages/tenant-dispatch/src/use-cases/process/` — base + 2 subclass

Tách thành **abstract base class** + **2 concrete use case** thay vì param
`lane`. Lợi ích: handler nhỏ gọn, log prefix theo lane, debug stack trace
thấy ngay class cụ thể, subclass dễ extend riêng nếu sau này cần.

```typescript
// process-dispatch-batch.ts — abstract base
export interface ProcessDispatchBatchInput {
  /** Override query limit mỗi iteration — dùng cho testing. Default do subclass quyết định. */
  limit?: number;
  /** Override soft time-budget (ms) — dùng cho testing. */
  maxExecutionMs?: number;
}

export abstract class ProcessDispatchBatchBaseUseCase extends InternalUseCase<
  ProcessDispatchBatchInput,
  ProcessDispatchBatchOutput
> {
  protected abstract defaultLimit(): number;
  protected abstract defaultMaxExecutionMs(): number;
  protected abstract fetchPending(limit: number): Promise<PendingDispatchOrder[]>;

  protected async execute(input: ProcessDispatchBatchInput) {
    const limit = input.limit ?? this.defaultLimit();
    const maxMs = input.maxExecutionMs ?? this.defaultMaxExecutionMs();
    const start = Date.now();

    // Loop fetch → process → flush cho đến cạn pending hoặc hết budget.
    // `pending.length < limit` ⇒ đã cạn nên early return, không tốn thêm round trip.
    while (Date.now() - start < maxMs) {
      const pending = await this.fetchPending(limit);
      if (pending.length === 0) return { ...total, done: true };
      // group theo tenant → chunk → processChunk → bulkApplyBatchResult → cộng dồn
      if (pending.length < limit) return { ...total, done: true };
    }
    return { ...total, done: false };
  }
}

// process-main-dispatch-batch.ts
export class ProcessMainDispatchBatchUseCase extends ProcessDispatchBatchBaseUseCase {
  protected defaultLimit() { return DISPATCH_MAIN_QUERY_LIMIT; }
  protected defaultMaxExecutionMs() { return DISPATCH_MAIN_MAX_EXECUTION_MS; }
  protected fetchPending(limit: number) {
    return this.repo.getPendingMainBatch(limit);
  }
}

// process-retry-dispatch-batch.ts
export class ProcessRetryDispatchBatchUseCase extends ProcessDispatchBatchBaseUseCase {
  protected defaultLimit() { return DISPATCH_RETRY_QUERY_LIMIT; }
  protected defaultMaxExecutionMs() { return DISPATCH_RETRY_MAX_EXECUTION_MS; }
  protected fetchPending(limit: number) {
    return this.repo.getPendingRetryBatch(limit);
  }
}
```

Toàn bộ group-by-tenant, chunking, `processChunk`, `queueFailure` nằm trong
base class — subclass chỉ override 3 method ngắn.

**Loop đến cạn hàng hoặc hết budget** (giống pattern `EnqueueDispatchPayoutsUseCase`):
trong 1 tick cron, có thể quét vài iterations `limit` orders. Soft budget
chừa buffer trước Lambda timeout cứng để flush log / bulk write an toàn.
Output có thêm `iterations` (quan sát throughput) và `done` (`true` nếu
cạn pending, `false` nếu dừng vì hết giờ — tick sau sẽ tiếp tục).

**Accumulator đơn giản hóa**: chỉ 1 accumulator duy nhất xuyên suốt cả batch
(không còn per-tenant rồi `mergeAcc`). Lý do: caller chỉ cần tổng
`dispatched`, `failed`; không cần thống kê per-tenant —
nếu sau này muốn, đã có log per-chunk kèm `tenantId` + error.

**Flush 1 round trip**: gộp `bulkMarkDispatched` + `bulkMarkAttemptFailed`
thành `bulkApplyBatchResult` — mixed `updateOne` ops trong 1 `bulkWrite`,
tiết kiệm thêm 1 RTT. `ordered: false` nên 2 loại op độc lập, lỗi 1 op
không chặn op còn lại.

### 2.6. `apps/worker-tenant-dispatch/src/handlers/dispatch/process-batch.ts`

Handler main lane instance thẳng class main:

```typescript
import { ProcessMainDispatchBatchUseCase } from "@megawin/tenant-dispatch/use-cases/process";

const useCase = new ProcessMainDispatchBatchUseCase();

export async function handler() {
  const result = await useCase.run();
  console.info(`[tenant-dispatch][main] ${JSON.stringify(result)}`);
  return result;
}
```

### 2.7. `apps/worker-tenant-dispatch/src/handlers/dispatch/process-retry-batch.ts` (MỚI)

```typescript
/**
 * Lambda: tenant-dispatch process-retry-batch.
 *
 * EventBridge trigger: rate(3 minutes).
 *
 * Chỉ xử lý orders đã fail ít nhất 1 lần (retryCount exists).
 * Timeout cao hơn main lane (5 phút) vì tenant gặp vấn đề có thể phản hồi chậm.
 *
 * Isolated với main lane: orders retry không chặn orders fresh.
 */

import { ProcessRetryDispatchBatchUseCase } from "@megawin/tenant-dispatch/use-cases/process";

const useCase = new ProcessRetryDispatchBatchUseCase();

export async function handler() {
  const result = await useCase.run();
  console.info(`[tenant-dispatch][retry] ${JSON.stringify(result)}`);
  return result;
}
```

### 2.8. `apps/worker-tenant-dispatch/src/functions/dispatch.yml`

```yaml
process-batch:
  handler: src/handlers/dispatch/process-batch.handler
  timeout: 60
  memorySize: 512
  reservedConcurrency: 1
  events:
    - schedule:
        rate: rate(1 minute)
        enabled: true
```

### 2.9. `apps/worker-tenant-dispatch/src/functions/dispatch-retry.yml` (MỚI)

```yaml
process-retry-batch:
  handler: src/handlers/dispatch/process-retry-batch.handler
  timeout: 300
  memorySize: 512
  reservedConcurrency: 1
  events:
    - schedule:
        rate: rate(3 minutes)
        enabled: true
```

### 2.10. `apps/worker-tenant-dispatch/serverless.yml`

Thêm import function thứ 2:

```yaml
functions:
  - ${file(src/functions/dispatch.yml)}
  - ${file(src/functions/dispatch-retry.yml)}
```

---

## 3. Thứ tự thực hiện & rollout

### Giai đoạn 1 — Domain package (không ảnh hưởng production)

1. Update JSDoc `retryCount` trong entity.
2. Thêm `getPendingMainBatch` + `getPendingRetryBatch` + `queryPendingOrders`
  trong repo. Giữ `getPendingBatch` với `@deprecated`.
3. Thêm constants mới; `DISPATCH_QUERY_LIMIT` đã xoá (verify không còn reference).
4. Sửa use case nhận param `lane`.
5. Unit test cho 2 method repo mới (mock collection, verify filter structure).

### Giai đoạn 2 — Worker app

1. Sửa handler `process-batch.ts` để pass `lane: "main"`.
2. Tạo handler `process-retry-batch.ts`.
3. Tạo `dispatch-retry.yml`.
4. Sửa `dispatch.yml` thêm `reservedConcurrency: 1`, `timeout: 60`.
5. Update `serverless.yml` include function mới.

### Giai đoạn 3 — Deploy & verify

1. Deploy `dev`. Verify CloudWatch:
  - Main lambda log có `"lane":"main"`.
    - Retry lambda log có `"lane":"retry"`.
    - Fresh order insert → main lambda pick → dispatch OK.
    - Force fail 1 order (tenant mock trả lỗi) → retryCount=1 → lần tới
    retry lambda pick, main lambda skip.
2. Deploy `prod` sau khi dev verify ≥ 1 ngày.

### Giai đoạn 4 — Cleanup (sau 1 release)

1. Grep `getPendingBatch` trong codebase — nếu không còn caller, xoá method
  deprecated.
2. `DISPATCH_QUERY_LIMIT` đã xoá sau khi verify không còn ai dùng.

---

## 4. Kiểm thử

### 4.1. Unit tests

- `dispatch-order-repo.test.ts`:
  - `getPendingMainBatch` filter đúng `{ $exists: false }`.
  - `getPendingRetryBatch` filter đúng `{ $exists: true }`.
  - 2 filter không giao nhau: insert 10 orders mixed retryCount, verify
  `main.length + retry.length == total`, `main ∩ retry = ∅`.
- `process-dispatch-batch.test.ts`:
  - `lane: "main"` gọi `getPendingMainBatch` với limit mặc định 500.
  - `lane: "retry"` gọi `getPendingRetryBatch` với limit mặc định 100.

### 4.2. Integration test kịch bản

Seed 3 orders:

- Order A: `status=Pending, retryCount=undefined` → main phải pick.
- Order B: `status=Pending, retryCount=3, nextAttemptAt=now-1s` → retry pick.
- Order C: `status=Pending, retryCount=5, nextAttemptAt=now+10min` → không lane nào pick.

Chạy main handler: chỉ A được xử lý.
Chạy retry handler: chỉ B được xử lý.
C chờ backoff.

### 4.3. Smoke test manual trên dev

1. Enqueue 1 payout order (giả lập từ Keno settle) → main dispatch success.
2. Giả lập tenant 500: patch `TenantGateway.batchTransaction` trả `success=false` với 1 order.
3. Xác nhận:
  - Trong 60s tới, CloudWatch main lambda không pick order đó lại (không match filter).
  - Trong 3 phút tới, retry lambda pick order đó.

---

## 5. Rủi ro & mitigation


| Rủi ro                                                            | Tác động                                                                                                  | Mitigation                                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orders tồn đọng cũ có `retryCount=0` (nếu có)                     | Không lane nào pick (`$exists=true` match, nhưng ngữ nghĩa sai)                                           | Chạy migration 1 lần: `updateMany({ retryCount: 0 }, { $unset: { retryCount: "" }})`. Kiểm tra trước khi deploy bằng `countDocuments({ retryCount: 0 })`.                 |
| `reservedConcurrency: 1` gây throttle khi Lambda cũ chưa release  | Miss 1 tick schedule                                                                                      | Chấp nhận được — schedule là `rate(...)` không phải cron strict; lần tick sau pick lên. Nếu thấy throttle thường xuyên, escalate sang plan worker-lock.                   |
| 2 function cùng ghi `retryCount` race                             | Không thực sự race (filter loại trừ), nhưng nếu code retry-lane fail → markAttemptFailed tăng lên 2, 3... | Đúng semantic: retry-lane fail cũng tăng retryCount. Không cần xử lý gì.                                                                                                  |
| Retry lane backlog phình to (tenant down dài)                     | Dispatch chậm, nhưng không ảnh hưởng main                                                                 | Thêm Axiom alarm: `retry_lane_polled > 80` trong 5 tick liên tiếp → báo ops.                                                                                              |
| Admin force-retry spike dồn orders vào retry lane                  | (Không áp dụng: `RetryBatchUseCase` đã xoá)                                                                 | N/A — không còn admin action nào dồn tải.                                                                                                                                |
| Index `{status, nextAttemptAt}` kém hiệu quả với `$exists` filter | Query chậm nếu collection phình to                                                                        | Trung hạn: thêm partial index `{status:1, nextAttemptAt:1}` với `partialFilterExpression: { retryCount: { $exists: false }}` cho main lane. Chỉ làm khi thấy metric chậm. |


---

## 6. Observability

### Log structure

Mỗi invocation log 1 JSON line:

```json
{
  "lane": "main" | "retry",
  "polled": 150,
  "dispatched": 140,
  "failed": 8,
  "exhausted": 2,
  "chunkErrors": 0
}
```

### Axiom queries cần thiết

- **Main lane throughput**: `lane:main | count_by polled over 5m`.
- **Retry lane backlog**: `lane:retry | avg(polled) over 1h` — tăng dần = có vấn đề.
- **Exhausted rate**: `exhausted > 0 group_by lane` — alarm nếu main lane có exhausted (không bình thường, fresh không nên cap).

### Metric cần thêm (giai đoạn sau)

- `dispatch_duration_by_tenant` — ai là kẻ slow.
- `retry_lane_age_seconds` — order ngồi ở retry lane bao lâu rồi.

---

## 7. Không đổi

Để anchor review, những thứ **không** đổi trong plan này:

- `batchKey`, flow enqueue, `TransactionAction/Reason`, builders.
- Tenant gateway contract.
- Backoff **công thức** (exponential) — chỉ đổi hằng số.
- Status `Pending`, `Dispatched`, `Cancelled` — giữ nguyên.

**Có đổi (so với plan gốc):**

- ❌ `MAX_RETRY_BY_KIND` → xoá.
- ❌ `hasExhaustedRetry` → xoá.
- ❌ `markExhausted` → xoá (không còn khái niệm "hết budget retry").
- ❌ `DispatchOrderStatus.Failed` → **xoá** (không còn path tự động; app chưa deploy).
- ❌ `RetryBatchUseCase` + API route `/api/tenant-dispatch/retry-batch` → **xoá** (§9.3).

---

## 8. Retry strategy — Vô hạn cho MỌI lỗi

### 8.1. Quy ước nghiệp vụ

**Mọi order MegaWin dispatch phải được hoàn tất tenant-side.** Không có khái niệm "tenant từ chối hợp lệ":


| sourceKind | action               | Lý do phải hoàn tất                                        |
| ---------- | -------------------- | ---------------------------------------------------------- |
| `Payout`   | credit               | Trả thưởng — MegaWin đã quyết định trả, tenant phải credit |
| `Refund`   | credit               | Hoàn tiền void — tenant phải credit                        |
| `Reversal` | debit + `force=true` | Thu hồi — tenant KHÔNG được từ chối                        |


→ Bất kỳ kết quả khác `success: true` đều là **tạm thời**, phải retry.

### 8.2. Error handling — Normalize vào 1 field `lastError`

**Không phân loại** error thành field riêng. Mọi error thông tin được normalize
thành 1 string duy nhất lưu ở `lastError` — đủ để staff debug và UI hiển thị.

**Format normalize:**


| Kịch bản                                 | Format `lastError`                     |
| ---------------------------------------- | -------------------------------------- |
| Per-item `success: false` (có `r.error`) | `[ERROR_CODE] message`                 |
| Outer `success: false`                   | `Outer fail: [CODE] message`           |
| HTTP throw / timeout                     | `err.message` hoặc `HTTP error: <raw>` |
| Unknown                                  | `Unknown error`                        |


**Helper function** (trong use case hoặc shared util):

```typescript
function normalizeError(
  source:
    | { kind: "item"; error?: { code?: string; message?: string } }
    | { kind: "outer"; error?: { code?: string; message?: string } }
    | { kind: "http"; err: unknown },
): string {
  if (source.kind === "item") {
    const code = source.error?.code ?? "UNKNOWN";
    const msg = source.error?.message ?? "Item error";
    return `[${code}] ${msg}`;
  }
  if (source.kind === "outer") {
    const code = source.error?.code ?? "UNKNOWN";
    const msg = source.error?.message ?? "Batch outer failed";
    return `Outer fail: [${code}] ${msg}`;
  }
  // http
  const err = source.err as { message?: string } | undefined;
  return err?.message ?? "HTTP error";
}
```

→ Field cũ `lastError` (đã có trong entity) đủ — **KHÔNG thêm** `lastErrorKind`,
`lastErrorCode`, `rejectedAt`.

### 8.3. Entity — Không đổi field cho error

`TenantDispatchOrderDoc` giữ nguyên:

- `retryCount?: number` — số lần fail (như đã bàn ở §2.2).
- `lastError?: string` — string đã normalized.
- `lastAttemptAt?: Date` — thời điểm attempt gần nhất.

**KHÔNG** thêm:

- ❌ `lastErrorKind` — không cần, filter bằng text pattern trên `lastError`.
- ❌ `lastErrorCode` — đã nằm trong `lastError` (prefix `[CODE]`).
- ❌ `rejectedAt` — không còn khái niệm "rejected permanent".
- ❌ `errorHistory[]` — tránh phình doc; lịch sử log ra Axiom.

### 8.4. Repo changes

**Xoá** `markExhausted` hoàn toàn.

**Sửa** `markAttemptFailed` — signature không đổi (vẫn nhận `error: string`):

```typescript
/**
 * Ghi nhận 1 attempt thất bại — retry vô hạn.
 *
 * Caller PHẢI normalize error string trước (xem `normalizeError`) — repo không
 * biết context (tenant vs HTTP).
 *
 * $inc `retryCount`, $set `lastError` / `lastAttemptAt` / `nextAttemptAt`.
 * KHÔNG đổi `status` — vẫn giữ `Pending`.
 */
async markAttemptFailed(
  tx: string,
  error: string,
  nextAttemptAt: Date,
  at: Date = new Date(),
): Promise<boolean> {
  // Signature đã đúng — không đổi gì, chỉ update JSDoc
  return await this.updateOne(
    { tx },
    {
      $inc: { retryCount: 1 },
      $set: {
        lastError: error,
        lastAttemptAt: at,
        nextAttemptAt,
        updatedAt: at,
      },
    },
  );
}
```

**XOÁ** mọi reference tới status `Failed` trong repo (cancelOrder filter,
progress aggregation...) và xoá luôn method `resetBatchForRetry` (không còn ai
gọi sau khi `RetryBatchUseCase` bị remove — xem §9.3).

### 8.5. Use case changes

`process-dispatch-batch.ts` — normalize error + retry thống nhất:

```typescript
private async processChunk(...) {
  try {
    const response = await client!.batchTransaction({ items });

    // Batch-level fail: tenant từ chối cả batch (sai API key, payload invalid...).
    // KHÔNG phải transport — tenant đã xử lý chủ đích. Queue retry toàn bộ.
    if (!response.success) {
      const errMsg = normalizeError({ kind: "outer", error: response.error });
      this.logError("batch_outer_failed", {
        error: errMsg,
        orderCount: orders.length,
      });
      for (const o of orders) {
        await this.markFailure(o, errMsg, stats);
      }
      return stats;
    }

    const txMap = new Map(orders.map((o) => [o.tx, o]));
    for (const r of response.data!.results) {
      const order = txMap.get(r.tx);
      if (!order) continue;

      if (r.success) {
        await this.repo.markDispatched(order.tx);
        stats.dispatched += 1;
      } else {
        // Tenant xử lý nhưng trả error per item → retry
        const errMsg = normalizeError({ kind: "item", error: r.error });
        await this.markFailure(order, errMsg, stats);
        this.logError("item_tenant_error", {
          tx: order.tx,
          tenantId: order.tenantId,
          lastError: errMsg,
          retryCount: (order.retryCount ?? 0) + 1,
        });
      }
    }
  } catch (err: any) {
    // Transport error thật sự: timeout, network, 5xx không parse được.
    const errMsg = normalizeError({ kind: "http", err });
    this.logError("chunk_transport_error", { error: errMsg });
    for (const o of orders) {
      await this.markFailure(o, errMsg, stats);
    }
  }
  return stats;
}

private async markFailure(
  order: PendingDispatchOrder,
  errMsg: string,
  stats: { failed: number },
): Promise<void> {
  const newRetryCount = (order.retryCount ?? 0) + 1;
  const nextAt = computeNextAttemptAt(newRetryCount);
  await this.repo.markAttemptFailed(order.tx, errMsg, nextAt);
  stats.failed += 1;

  // Edge-trigger alert khi vừa chạm threshold
  if (newRetryCount === RETRY_ALERT_THRESHOLD) {
    this.logError("high_retry_reached", {
      tx: order.tx,
      tenantId: order.tenantId,
      retryCount: newRetryCount,
      lastError: errMsg,
    });
  }
}
```

**Output stats:**

```typescript
export interface ProcessDispatchBatchOutput {
  polled: number;
  dispatched: number;
  /** Fails (tenant-error + transport-error gộp) — sẽ retry vô hạn. */
  failed: number;
}
```

**XOÁ** fields `exhausted`, `rejected`, `chunkErrors` cũ.

### 8.6. Backoff function

`backoff.ts` chỉ còn `computeNextAttemptAt`. **Bỏ jitter**: với
`reservedConcurrency: 1` + `limit: 100/tick`, thundering herd bị throttle
cứng bởi Lambda single instance — jitter không mang lại hiệu quả thực tế
mà làm `nextAttemptAt` phi deterministic, khó debug.

**XOÁ** `hasExhaustedRetry` + export khỏi `index.ts`.

---

## 9. `DispatchOrderStatus` — Xoá `Failed`

### 9.1. Status sau thay đổi


| Status       | Trigger                                           | Ý nghĩa                                          |
| ------------ | ------------------------------------------------- | ------------------------------------------------ |
| `Pending`    | Default khi enqueue; hoặc sau `markAttemptFailed` | Đang trong vòng retry                            |
| `Dispatched` | Tenant trả `success: true`                        | Giao dịch đã hoàn tất tenant-side                |
| `Cancelled`  | Admin huỷ qua `cancelOrder`                       | Dừng dispatch (chỉ cho phép khi chưa Dispatched) |


### 9.2. Lý do xoá `Failed`

Với quy ước "mọi order phải được dispatch cho đến khi thành công":

- Không còn path tự động nào dẫn tới `Failed` (cap retry đã bỏ, tenant-rejected cũng retry).
- Admin cũng không "mark failed" — chỉ `Cancelled` hoặc để retry.
- → Giữ `Failed` chỉ tạo thêm confusion cho dev sau này đọc code.

**App chưa deploy** → xoá gọn, không cần migration compat.

### 9.3. Xoá `RetryBatchUseCase` + API route

Với logic retry vô hạn, không còn tình huống nào admin cần "bắt đầu lại" thủ
công. Worker tự retry theo backoff đến khi thành công.

**Xoá**:

1. `packages/tenant-dispatch/src/use-cases/admin/retry-batch.ts` — xoá file.
2. `packages/tenant-dispatch/src/use-cases/admin/index.ts` — bỏ export
   `RetryBatchUseCase`, `RetryBatchInput`, `RetryBatchOutput`.
3. `apps/backoffice/src/app/api/tenant-dispatch/retry-batch/route.ts` — xoá file
   (cả folder `retry-batch/`).
4. `apps/backoffice/src/app/api/tenant-dispatch/_lib/schema.ts` — xoá
   `retryBatchSchema`.
5. `packages/tenant-dispatch/src/infras/repos/dispatch-order-repo.ts` — xoá
   method `resetBatchForRetry` (không còn ai gọi); **không cần** đổi tên thành
   `forceRetryBatch` vì không cần admin force retry nữa.

**Frontend**: bất kỳ call đến `/api/tenant-dispatch/retry-batch` phải được xoá
khỏi BO UI. Trong phạm vi plan này chỉ cần xoá route; UI xoá button/flow đó
trong plan `tenant_dispatch_stuck_orders_ui.plan.md`.

**Edge case vẫn muốn rush 1 batch**: staff mở Mongo console set
`nextAttemptAt: now` — không cần UI. Nếu sau này thực sự phát sinh nhu cầu, viết
use case mới rõ ràng hơn (vd. theo filter cụ thể) thay vì mang `RetryBatchUseCase`
cũ trở lại.

---

## 10. UI — Orders cần staff theo dõi

### 10.1. 1 view duy nhất: "Stuck orders"

Vì không có field phân loại riêng, UI chỉ 1 view: **"Stuck orders"** — orders
đang retry vượt threshold.

Staff nhìn cột `lastError` để tự hiểu loại lỗi:

- Có prefix `[CODE]` → tenant xử lý nhưng lỗi (vd `[INTERNAL_ERROR] Database timeout`).
- Có prefix `Outer fail:` → batch-level rejection từ tenant.
- Các string khác → HTTP/network/timeout.

Nếu muốn filter theo loại, dùng **text search** trên `lastError` ở BO UI
(regex/contains) thay vì Mongo field query.

### 10.2. API endpoint mới

**BO API `/api/tenant-dispatch/orders/stuck`** — list orders retry nhiều:

- Query params: `tenantId?`, `search?` (text match trên `lastError`), `limit?`, `skip?`.
- Filter base: `status: Pending, retryCount: { $gte: RETRY_ALERT_THRESHOLD }`.
- Sort: `retryCount DESC`.
- Return: tx, tenantId, sourceKind, amount, username, retryCount, `lastError`,
lastAttemptAt, nextAttemptAt, batchKey.

### 10.3. Repo method mới

```typescript
/**
 * List orders đang retry nhiều lần — theo dõi để staff can thiệp.
 *
 * Các orders này vẫn đang Pending và sẽ tiếp tục retry; UI chỉ để staff biết
 * để can thiệp (liên hệ tenant, kiểm tra infra, force retry sau khi fix...).
 */
async listStuck(filter: {
  threshold?: number;
  tenantId?: string;
  limit?: number;
  skip?: number;
}): Promise<TenantDispatchOrderEntity[]> {
  const mongoFilter: any = {
    status: DispatchOrderStatus.Pending,
    retryCount: { $gte: filter.threshold ?? RETRY_ALERT_THRESHOLD },
  };
  if (filter.tenantId) mongoFilter.tenantId = filter.tenantId;

  return await this.findMany(mongoFilter, {
    sort: { retryCount: -1 },
    limit: filter.limit ?? 100,
    skip: filter.skip ?? 0,
  });
}
```

### 10.4. Tương tác staff với 1 stuck order

Staff mở detail 1 order → có thể:

1. **Xem error history**: click button mở Axiom log filter theo `tx` — xem toàn bộ lần fail theo thời gian.
2. **Wait** (default): không làm gì, chờ retry tự khỏi.
3. **Cancel**: gọi `cancelOrder` nếu business quyết định không dispatch (edge case).

> "Force retry now" đã bị bỏ khỏi UI (xoá cùng `RetryBatchUseCase`). Nếu sau này
> thực sự cần, thêm use case chuyên biệt ở plan riêng — KHÔNG mang
> `RetryBatchUseCase` cũ trở lại.

### 10.5. Index cần thêm (optional, tune sau)

- `{ status: 1, retryCount: -1 }` partial `status=Pending AND retryCount>=50`.

Chỉ thêm nếu production thấy query chậm.

---

## 11. Checklist update cho Giai đoạn 1

Bổ sung các bước (ngoài checklist §3):

**Giai đoạn 1 — thêm bước:**

- Xoá `MAX_RETRY_BY_KIND` khỏi `constants.ts`.
- Xoá `hasExhaustedRetry` khỏi `backoff.ts` + export index.
- Thêm `RETRY_ALERT_THRESHOLD = 50` vào `constants.ts`.
- Đổi `BACKOFF_BASE_SECONDS: 10 → 30`.
- Đổi `BACKOFF_MAX_SECONDS: 600 → 1800`.
- Entity: **KHÔNG** đổi field — giữ nguyên `lastError`, `retryCount`, `lastAttemptAt`.
- `enums.ts`: xoá `DispatchOrderStatus.Failed`.
- Thêm helper `normalizeError(source)` trong use case process layer.
- Repo: xoá `markExhausted`. `markAttemptFailed` giữ signature cũ (JSDoc only change).
- Repo: **xoá** `resetBatchForRetry` (không thay bằng `forceRetryBatch`).
- Repo: thêm `listStuck`. Xoá mọi reference `status: Failed` trong repo (aggregateBatchProgress, cancelOrder filter...).
- Use case: dùng `normalizeError` ở cả 3 case (outer fail, item fail, HTTP throw).
- Use case: đổi stats → `{polled, dispatched, failed, done, iterations}`.
- **Xoá `RetryBatchUseCase`**: file `retry-batch.ts`, exports trong `use-cases/admin/index.ts`.
- **Xoá API route** `apps/backoffice/src/app/api/tenant-dispatch/retry-batch/route.ts` (cả folder) + `retryBatchSchema` trong `_lib/schema.ts`.
- Thêm use case mới + API route cho `listStuck`.

---

## 12. Migration — App chưa deploy

**Không cần migration**. App chưa production, không có data cũ phải chuyển đổi.

Nếu sau này có data test ở dev với status `Failed`:

```javascript
// Mongo shell — nếu cần dọn dev DB
db.tenant_dispatch_orders.updateMany(
  { status: "failed" },
  { $set: { status: "pending", nextAttemptAt: new Date() } }
);
```

---

## 13. Observability (bổ sung từ §6)

### Log events mới


| Event                | Level | Trigger                                              | Payload quan trọng                               |
| -------------------- | ----- | ---------------------------------------------------- | ------------------------------------------------ |
| `batch_outer_failed` | error | Outer `success: false`                               | tenantId, error (normalized), orderCount         |
| `item_tenant_error`  | warn  | Per-item `success: false`                            | tx, tenantId, lastError (normalized), retryCount |
| `chunk_http_error`   | warn  | HTTP throw từ toàn chunk                             | tenantId, error, orderCount                      |
| `high_retry_reached` | warn  | `retryCount == RETRY_ALERT_THRESHOLD` (edge trigger) | tx, tenantId, retryCount, lastError              |


Tất cả `error`/`lastError` đều đã normalize theo format `[CODE] message` khi là tenant-side,
hoặc raw message khi là HTTP error.

### Axiom alarms

- `high_retry_reached` count > 5 trong 10 phút → **Warning** — nhiều orders đang stuck.
- `item_tenant_error` rate đột ngột tăng → **Warning** — tenant có vấn đề xử lý.
- Retry lane `polled` > 80 liên tục 30 phút → **Warning** — backlog lớn.
- Main lane `dispatched` rate đột ngột giảm 50% → **Critical**.

### Dashboard Axiom suggest

- **Panel 1**: Main lane throughput (dispatched/min).
- **Panel 2**: Retry lane backlog size (polled trend).
- **Panel 3**: Top `lastError` values trong `high_retry_reached` events — xem error codes phổ biến.
- **Panel 4**: Stuck orders by tenantId (`retryCount >= 50` count).

---

## 14. Tóm tắt quyết định retry (cập nhật)


| Đầu ra từ tenant       | `lastError` format           | Trạng thái              | Retry?     |
| ---------------------- | ---------------------------- | ----------------------- | ---------- |
| Item `success: true`   | — (unset)                    | `Dispatched`            | —          |
| Item `success: false`  | `[CODE] message`             | `Pending` (+retryCount) | **Vô hạn** |
| Outer `success: false` | `Outer fail: [CODE] message` | `Pending` (+retryCount) | **Vô hạn** |
| HTTP throw / timeout   | `err.message` raw            | `Pending` (+retryCount) | **Vô hạn** |


**Config:**

- Backoff: 30s base, 30p cap, không jitter, ~7 fails chạm cap.
- Threshold alert: `retryCount >= 50` (≈ 1 ngày) → UI hiển thị + log warn (edge-trigger).

**Admin actions:**

- **Force retry batch**: reset `nextAttemptAt = now` cho Pending orders → worker pick ngay.
- **Cancel order**: chuyển sang `Cancelled` nếu business quyết định không dispatch (edge case).

**Fields:**

- `lastError` — string normalized, đủ để debug và UI hiển thị.
- `retryCount` — số lần fail, dùng làm đường phân lane main/retry.

**Status set:**

- `Pending`, `Dispatched`, `Cancelled` (3 states — đã xoá `Failed`).

