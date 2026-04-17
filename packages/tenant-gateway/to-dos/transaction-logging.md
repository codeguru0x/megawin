# Transaction Logging — Thiết kế hệ thống ghi log giao dịch

> **Status**: TODO — chưa implement.
> **Priority**: High — cần có trước khi go production với tenant thật.
> **Estimated effort**: Phase 1 ~2-3 ngày, Phase 2 ~5-7 ngày.

---

## 1. Bối cảnh & Hiện trạng

`@megawin/tenant-gateway` gọi callback API tới tenant server để xử lý giao dịch tài chính
(payout, refund). Hiện tại **không có audit trail** — flow hiện tại chỉ là:

```
dispatch-payout.ts → tenantGateway.getClient(tenantId) → gateway.batchPayout({ items })
                   → mark entry dispatched/failed
```

**Không lưu lại**:

- Request payload chính xác gửi đi (body JSON)
- Response payload tenant trả về
- HTTP metadata: status code, headers, latency
- Timing: bao lâu, retry bao nhiêu lần, lần nào thành công
- Error details: error code tenant trả về, message

**Hậu quả**:

- Tenant tranh chấp → không có bằng chứng
- Player khiếu nại "thắng nhưng không nhận tiền" → không trace được
- Đối soát hàng tháng → phải so entry by entry thủ công
- Retry storm → không phát hiện được

### Files liên quan hiện tại

| File                                                         | Vai trò                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `packages/tenant-gateway/src/transaction/transaction-api.ts` | `createTransactionApi()` — factory tạo TransactionApi, nơi gọi `http.post()` |
| `packages/tenant-gateway/src/balance/balance-api.ts`         | `createBalanceApi()` — factory tạo BalanceApi, nơi gọi `http.get()`          |
| `packages/tenant-gateway/src/client.ts`                      | `createTenantGatewayClient()` — tạo HttpClient per tenant                    |
| `packages/tenant-gateway/src/gateway.ts`                     | `tenantGateway` facade — cache + resolve client                              |
| `packages/tenant-gateway/src/shared/endpoints.ts`            | `CALLBACK_PATHS` — URL paths cho callback API                                |
| `packages/http-client/src/http-client.ts`                    | `HttpClient` class — base HTTP client với retry                              |
| `packages/http-client/src/retry.ts`                          | Retry logic với exponential backoff                                          |

---

## 2. Tại sao bắt buộc cần?

### 2.1 Financial Audit Trail

Giao dịch tài chính bắt buộc phải có **immutable audit trail**. Kịch bản thực tế:

- Tenant báo "chưa nhận được request payout cho draw 2026-04-10.095" → MegaWin không có log
  để chứng minh đã gửi, gửi lúc nào, tenant trả response gì.
- MegaWin ghi entry = "dispatched" nhưng tenant nói "chưa nhận" → ai đúng?
- Tenant trả "success" nhưng player balance không tăng → cần response payload làm bằng chứng.

### 2.2 Reconciliation (Đối soát)

Hàng ngày/tháng cần đối soát giữa MegaWin vs Tenant:

| Check                                               | Không có log               | Có log                                                     |
| --------------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| Tổng credit gửi = Tổng credit tenant nhận?          | So entry by entry thủ công | Query `SUM(amount) WHERE status=success GROUP BY tenantId` |
| Giao dịch nào MegaWin success nhưng tenant missing? | Không biết                 | `LEFT JOIN tenant_report ON tx`                            |
| Duplicate rate bất thường?                          | Không phát hiện            | `COUNT(*) WHERE status=duplicate`                          |
| Tenant nào consistently slow?                       | Không biết                 | `AVG(latencyMs) GROUP BY tenantId`                         |

### 2.3 Debugging & Incident Response

- Player khiếu nại → trace `tx` từ entry → dispatch log → response
- Tenant báo spike traffic → biết chính xác bao nhiêu request, bao nhiêu timeout
- Batch partial failure → biết item nào fail, error code gì

### 2.4 Retry Intelligence

Hiện tại retry là blind. Với log chi tiết:

- Phát hiện tenant nào consistently slow (latency P99 > 5s)
- Phát hiện error pattern (e.g. `INSUFFICIENT_BALANCE` lúc cao điểm)
- Smart retry: chỉ retry items thật sự fail, skip đã success/duplicate
- Circuit breaker: tenant lỗi liên tục → pause dispatch

### 2.5 Compliance & Legal

Ngành game online ở nhiều jurisdiction yêu cầu **7-year financial record retention**.
Transaction log là evidence hợp pháp khi kiểm toán.

---

## 3. Thiết kế — Phase 1: Structured Logging (CloudWatch)

> **Goal**: Zero infrastructure cost, implement nhanh, dùng ngay.

### 3.1 Nguyên tắc

- Logging **trong** `@megawin/tenant-gateway` layer — **không** ở 14 dispatch files
- Consumer (dispatch use cases) **không cần biết** về logging
- Single point of logging: mọi tenant API call đều đi qua đây
- Structured JSON → CloudWatch Insights query

### 3.2 Nơi đặt code

```
packages/tenant-gateway/src/
├── shared/
│   └── tx-logger.ts               ← NEW: Transaction logger utility
├── transaction/
│   └── transaction-api.ts         ← MODIFY: wrap http.post() với logging
└── balance/
    └── balance-api.ts             ← MODIFY: wrap http.get() với logging
```

### 3.3 Logger interface

```typescript
// packages/tenant-gateway/src/shared/tx-logger.ts

interface TxLogEntry {
  // ── Identity ──
  event: string; // "tenant_gateway.batch_transaction" | "tenant_gateway.transaction" | "tenant_gateway.balance"
  tx: string; // UUIDv7 idempotency key
  tenantId: string;

  // ── Transaction ──
  action: "credit" | "debit";
  reason: "payout" | "refund";
  playerId: string;
  amount: number;
  currency: string;

  // ── Context ──
  gameId: string;
  roundIds: string[]; // drawIds (multi-draw)
  entryId: string;
  ticketNo?: string;
  batchId?: string; // group items cùng batch call
  batchSize?: number;
  batchIndex?: number; // vị trí item trong batch

  // ── Result ──
  status: "success" | "duplicate" | "failed" | "timeout" | "error";
  httpStatus?: number;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  balanceAfter?: number;

  // ── Retry ──
  attempt: number;
}

function logTransaction(entry: TxLogEntry): void {
  // Phase 1: console.log(JSON.stringify({ level: "info", ...entry, timestamp: new Date().toISOString() }))
  // Phase 2: swap sang DB insert (fire-and-forget)
}
```

### 3.4 Integration point — transaction-api.ts

Hiện tại `createTransactionApi()` trong `transaction-api.ts` trả về object với methods
`batchPayout()`, `batchRefund()`, `transaction()`. Mỗi method gọi `http.post()`.

**Cách wrap**: Thêm logging trước/sau mỗi `http.post()` call, **trong** factory function.
Consumer code không thay đổi.

```typescript
// Pseudo-code — wrap batchTransaction trong createTransactionApi

async batchTransaction(payload: BatchTransactionRequest): Promise<BatchTransactionResponse> {
  const batchId = generateId(); // UUIDv7 cho batch grouping
  const startTime = Date.now();

  try {
    const response = await http.post<BatchTransactionResponse>(
      CALLBACK_PATHS.batchTransaction,
      payload,
    );

    const latencyMs = Date.now() - startTime;

    // Log per-item results
    for (let i = 0; i < response.results.length; i++) {
      const item = payload.items[i];
      const result = response.results[i];
      logTransaction({
        event: "tenant_gateway.batch_transaction",
        tx: item.tx,
        tenantId: payload.tenantId,  // hoặc từ context
        action: item.action,
        reason: item.reason,
        playerId: item.playerId,
        amount: item.amount,
        currency: item.currency,
        gameId: item.gameId,
        roundIds: item.roundIds,
        entryId: item.entryId,
        batchId,
        batchSize: payload.items.length,
        batchIndex: i,
        status: result.status,
        httpStatus: 200,
        latencyMs,
        errorCode: result.errorCode,
        errorMessage: result.error,
        balanceAfter: result.balanceAfter,
        attempt: 1,
      });
    }

    return response;
  } catch (err) {
    const latencyMs = Date.now() - startTime;

    // Log batch-level error
    for (const item of payload.items) {
      logTransaction({
        event: "tenant_gateway.batch_transaction",
        tx: item.tx,
        tenantId: payload.tenantId,
        action: item.action,
        reason: item.reason,
        playerId: item.playerId,
        amount: item.amount,
        currency: item.currency,
        gameId: item.gameId,
        roundIds: item.roundIds,
        entryId: item.entryId,
        batchId,
        batchSize: payload.items.length,
        status: err.name === "TimeoutError" ? "timeout" : "error",
        latencyMs,
        errorMessage: err.message,
        attempt: 1,
      });
    }

    throw err;
  }
}
```

### 3.5 CloudWatch Insights queries mẫu

```sql
-- Error rate per tenant (last 24h)
fields @timestamp, tenantId, status
| filter event = "tenant_gateway.batch_transaction"
| stats count(*) as total,
        count_distinct(case when status != "success" and status != "duplicate" then tx end) as errors
  by tenantId
| display tenantId, total, errors, (errors * 100.0 / total) as errorRate

-- Latency P99 per tenant
fields @timestamp, tenantId, latencyMs
| filter event = "tenant_gateway.batch_transaction"
| stats percentile(latencyMs, 99) as p99, avg(latencyMs) as avg by tenantId

-- Trace specific tx
fields @timestamp, tx, status, latencyMs, errorCode, errorMessage
| filter tx = "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b"
| sort @timestamp asc

-- Reconciliation: total amount dispatched per tenant per day
fields @timestamp, tenantId, amount, status
| filter event = "tenant_gateway.batch_transaction" and status = "success"
| stats sum(amount) as totalAmount, count(*) as txCount by tenantId, datefloor(@timestamp, 1d) as day

-- Duplicate storm detection
fields @timestamp, tenantId, status
| filter event = "tenant_gateway.batch_transaction" and status = "duplicate"
| stats count(*) as duplicates by tenantId, datefloor(@timestamp, 1h) as hour
| filter duplicates > 100
```

---

## 4. Thiết kế — Phase 2: Transaction Ledger (MongoDB)

> **Goal**: Queryable, persistent audit trail. Reconciliation tự động.

### 4.1 Collection schema

```typescript
// Collection: transaction_logs
// Database: megawin (cùng DB chính, hoặc DB riêng nếu muốn isolate)

interface TransactionLogDocument {
  _id: ObjectId;

  // ── Identity ──
  /** UUIDv7 idempotency key — unique index. */
  tx: string;
  /** Tenant ID — partition key cho reconciliation. */
  tenantId: string;
  /** Hướng giao dịch: MegaWin → Tenant. */
  direction: "outbound";

  // ── Transaction Info ──
  /** credit = tenant cộng tiền cho player, debit = tenant trừ tiền player. */
  action: "credit" | "debit";
  /** Lý do giao dịch. */
  reason: "payout" | "refund" | "rollback";
  /** Player account ID tại tenant. */
  playerId: string;
  /** Số tiền giao dịch (VND). */
  amount: number;
  /** Đơn vị tiền tệ. */
  currency: string;
  /** Game product key. */
  gameId: string;
  /** Draw IDs (multi-draw). */
  roundIds: string[];

  // ── Request ──
  /** Full JSON body gửi đi — evidence khi dispute. */
  requestPayload: Record<string, unknown>;
  /** Thời điểm gửi request. */
  requestAt: Date;

  // ── Response ──
  /** Full JSON body tenant trả về — evidence khi dispute. */
  responsePayload?: Record<string, unknown>;
  /** Thời điểm nhận response. */
  responseAt?: Date;
  /** HTTP status code. */
  httpStatus?: number;
  /** Response time (ms). */
  latencyMs: number;

  // ── Result ──
  /** Kết quả cuối cùng. */
  status: "success" | "duplicate" | "failed" | "timeout" | "error";
  /** Error code tenant trả về (e.g. INSUFFICIENT_BALANCE, PLAYER_NOT_FOUND). */
  errorCode?: string;
  /** Error message chi tiết. */
  errorMessage?: string;
  /** Balance player sau giao dịch (nếu tenant trả về). */
  balanceAfter?: number;

  // ── Retry ──
  /** Lần gọi thứ mấy (1-based). */
  attempt: number;
  /** _id của log record lần trước (nếu đây là retry). */
  retryOf?: ObjectId;

  // ── Cross-reference ──
  /** Entry ID trong game collection. */
  entryId: string;
  /** Draw ID. */
  drawId: string;
  /** Mã vé hiển thị cho player. */
  ticketNo?: string;
  /** Batch ID — group items cùng 1 HTTP call. */
  batchId?: string;

  // ── Timestamps ──
  createdAt: Date;
  /** TTL auto-delete — MongoDB tự xoá khi đến thời điểm này. */
  expiresAt: Date;
}
```

### 4.2 Indexes

```javascript
// Unique — lookup idempotency, trace specific transaction
db.transaction_logs.createIndex({ tx: 1 }, { unique: true });

// Reconciliation per tenant — đối soát hàng ngày/tháng
db.transaction_logs.createIndex({ tenantId: 1, createdAt: -1 });

// Trace all transactions for a draw
db.transaction_logs.createIndex({ drawId: 1 });

// Player complaint lookup
db.transaction_logs.createIndex({ playerId: 1, createdAt: -1 });

// Error monitoring dashboard
db.transaction_logs.createIndex({ status: 1, createdAt: -1 });

// Group batch items
db.transaction_logs.createIndex({ batchId: 1 });

// TTL — MongoDB tự xoá expired documents
db.transaction_logs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

### 4.3 Repository

```
packages/tenant-gateway/src/
└── infras/repos/
    └── transaction-log-repo.ts    ← NEW
```

```typescript
// packages/tenant-gateway/src/infras/repos/transaction-log-repo.ts

export class TransactionLogRepo extends MongoRepository<TransactionLogDocument> {
  constructor() {
    super({ collName: "transaction_logs", dbName: Constants.Default.DbName });
  }

  /** Insert log — fire-and-forget, không throw nếu fail. */
  async log(doc: Omit<TransactionLogDocument, "_id">): Promise<void> {
    try {
      await this.insertOne(doc);
    } catch (err) {
      // Log loss chấp nhận được — transaction vẫn phải succeed.
      console.error("[tx-log] Failed to insert transaction log:", err);
    }
  }

  /** Bulk insert cho batch transaction (1 HTTP call = N log records). */
  async logBatch(docs: Omit<TransactionLogDocument, "_id">[]): Promise<void> {
    try {
      await this.insertMany(docs);
    } catch (err) {
      console.error("[tx-log] Failed to bulk insert transaction logs:", err);
    }
  }

  /** Reconciliation query: tổng amount theo tenant trong khoảng thời gian. */
  async getReconciliationSummary(tenantId: string, from: Date, to: Date) { ... }

  /** Lookup by tx — trace giao dịch cụ thể. */
  async findByTx(tx: string) { ... }

  /** Error report — failed transactions chưa retry thành công. */
  async getFailedTransactions(tenantId: string, olderThan: Date) { ... }
}
```

### 4.4 Retention policy

| Tier     | Thời gian       | Storage                      | Query capability      |
| -------- | --------------- | ---------------------------- | --------------------- |
| **Hot**  | 0 – 60 ngày     | MongoDB primary              | Full query, real-time |
| **Warm** | 60 ngày – 2 năm | MongoDB (TTL chưa hết)       | Full query, slower    |
| **Cold** | 2 – 7 năm       | S3 archive (Parquet/JSON.gz) | Athena query khi cần  |

**Implementation**: `expiresAt = createdAt + 60 days`. Trước khi TTL delete, cron job archive
sang S3 (chạy weekly, archive records > 30 days).

> **Lưu ý**: `tx_intents` (WAL) dùng TTL 14 ngày trên `resolvedAt` — chỉ xoá documents
> đã resolved (COMPLETED / ROLLED_BACK / MANUAL_REVIEW). Documents chưa resolved giữ vĩnh viễn
> cho recovery. Xem `packages/game-core/src/indexes/index.ts` → `TX_INTENT_INDEXES`.

### 4.5 Migration Phase 1 → Phase 2

`tx-logger.ts` export 1 function `logTransaction()`. Phase 1 implementation = `console.log()`.
Phase 2 swap sang `TransactionLogRepo.log()`. Consumer code (transaction-api.ts) **không thay đổi**.

---

## 5. Phase 3 (dài hạn): Event Sourcing

```
TransactionRequested → TransactionSent → TransactionSucceeded
                                       → TransactionFailed → TransactionRetried → ...
```

Kafka/SQS event stream. Chỉ cần nếu:

- Scale rất lớn (> 100K transactions/day)
- Cần real-time analytics pipeline
- Cần event replay capability

Không cần ngay. Phase 1 + Phase 2 đủ cho 1-2 năm tới.

---

## 6. Checklist log fields — Priority

| Field                        | Mục đích                    | Priority | Phase |
| ---------------------------- | --------------------------- | -------- | ----- |
| `tx`                         | Trace + idempotency         | P0       | 1     |
| `tenantId`                   | Filter per tenant           | P0       | 1     |
| `action` + `reason`          | Phân loại giao dịch         | P0       | 1     |
| `playerId`                   | Player complaint lookup     | P0       | 1     |
| `amount` + `currency`        | Reconciliation              | P0       | 1     |
| `status`                     | Error rate aggregation      | P0       | 1     |
| `latencyMs`                  | Performance monitoring      | P0       | 1     |
| `gameId` + `roundIds`        | Cross-reference game data   | P0       | 1     |
| `entryId`                    | Cross-reference entry       | P1       | 1     |
| `httpStatus`                 | Detect tenant server issues | P1       | 1     |
| `errorCode` + `errorMessage` | Debug specific failures     | P1       | 1     |
| `batchId` + `batchIndex`     | Group items cùng batch      | P1       | 1     |
| `attempt`                    | Detect flaky tenants        | P1       | 1     |
| `requestPayload` (full)      | Evidence khi dispute        | P1       | 2     |
| `responsePayload` (full)     | Evidence khi dispute        | P1       | 2     |
| `ticketNo`                   | Player-facing reference     | P2       | 1     |
| `balanceAfter`               | Balance tracking            | P2       | 2     |

---

## 7. Daily Monitoring Checklist

| Metric                    | Threshold          | Action                  | CloudWatch query                        |
| ------------------------- | ------------------ | ----------------------- | --------------------------------------- |
| Error rate per tenant     | > 1%               | Alert ops team          | `stats count(*) ... by tenantId`        |
| Latency P99 per tenant    | > 10s              | Tenant cần optimize     | `percentile(latencyMs, 99) by tenantId` |
| Duplicate rate per tenant | > 5%               | Investigate retry storm | `filter status="duplicate"`             |
| Reconciliation delta      | != 0               | Escalate ngay           | Phase 2: compare DB sums                |
| Failed transactions aging | > 24h chưa success | Escalate                | `filter status="failed"`                |
| Timeout rate per tenant   | > 5%               | Review timeout config   | `filter status="timeout"`               |
| Total pending dispatches  | Tăng liên tục      | Check worker health     | Cross-reference entry DB                |

---

## 8. Implementation Steps

### Phase 1 (2-3 ngày)

- [ ] Tạo `packages/tenant-gateway/src/shared/tx-logger.ts` — `logTransaction()` function
- [ ] Modify `packages/tenant-gateway/src/transaction/transaction-api.ts`:
  - Wrap `batchTransaction()` với logging trước/sau `http.post()`
  - Wrap `transaction()` tương tự
- [ ] Modify `packages/tenant-gateway/src/balance/balance-api.ts`:
  - Wrap `getBalance()` với logging (lower priority, ít critical hơn transaction)
- [ ] Test: chạy dispatch locally, verify CloudWatch logs có đầy đủ fields
- [ ] Tạo CloudWatch Insights saved queries (error rate, latency, reconciliation)

### Phase 2 (5-7 ngày)

- [ ] Tạo `packages/tenant-gateway/src/infras/repos/transaction-log-repo.ts`
- [ ] Tạo MongoDB indexes (script hoặc migration)
- [ ] Swap `logTransaction()` từ `console.log` sang `TransactionLogRepo.logBatch()`
- [ ] Tạo S3 archive cron job (weekly, > 90 days)
- [ ] Tạo reconciliation API hoặc script
- [ ] Setup CloudWatch alarm cho error rate + latency P99

---

## 9. Performance Impact

| Phase   | Overhead          | Giải thích                                                                    |
| ------- | ----------------- | ----------------------------------------------------------------------------- |
| Phase 1 | ~0ms              | `console.log()` → CloudWatch agent async pickup                               |
| Phase 2 | ~5-15ms per batch | Async MongoDB insert, fire-and-forget. Nếu insert fail → log error + tiếp tục |

**Nguyên tắc**: Transaction log **KHÔNG BAO GIỜ** block dispatch flow. Nếu log insert fail,
transaction vẫn phải succeed. Log loss chấp nhận được — better than dispatch failure.
