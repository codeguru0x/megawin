# Tenant Transaction Logging — Thiết kế triển khai (v3)

> **Source**: `packages/tenant-gateway/to-dos/transaction-logging.md`
> **Status**: Planning — refactor round 3 (per feedback).
> **DB đích**: `megawin-tenant`
> **Collection**: `tx_logs` (đồng bộ convention với `tx_intents`)
> **Retention**: 3 tháng (90 ngày) — MongoDB TTL index.

---

## 1. Phạm vi

| API | Log? | Lý do |
|-----|------|-------|
| `POST /transaction` (single) | ✅ | Hot path debit/credit — critical. |
| `POST /transaction/batch` | ✅ | Payout/refund — critical. **1 doc / 1 item** trong batch. |
| `GET /transaction/:tx/status` | ❌ | Read-only probe. |
| `GET /balance` | ❌ | Read-only. |

---

## 2. Quyết định theo feedback round 3

| # | Feedback | Quyết định |
|---|----------|------------|
| 1 | Dùng luôn use-case trong `tenant-gateway` | **Bỏ package `tenant-gateway-application`**. Use-cases đặt trong `packages/tenant-gateway/src/use-cases/tx-logs/` + export qua subpath `@megawin/tenant-gateway/use-cases/tx-logs`. |
| 2 | 1 doc / 1 item (batch chia N docs) | **Applied.** Mỗi item = 1 doc riêng có `tx` unique. Thêm `batchId` để nhóm items cùng call. |
| 3 | `batchId` cho batch | **Applied.** `batchId` = UUIDv7 sinh tại logger, bằng với `tx` khi single (giữ 1 field optional thay vì null khác biệt). |
| 4 | Status đơn giản `success \| failed` | **Applied.** Bỏ 6-state `TxLogStatus`, còn 2 state. Chi tiết lỗi đọc trong `responsePayload`. |
| 5 | Có cần `latencyMs`? | **Bỏ.** Chỉ log **sau khi nhận response** (hoặc throw) — 1 DB call duy nhất. `createdAt` = thời điểm log (~ thời điểm nhận response). Dispute/performance đo qua APM / CloudWatch, không phải DB field. |
| 6 | Tên collection | `tx_logs` (thay vì `transaction_logs`). |
| 7 | UI filter | Exact tx + date range + status (`success \| failed`). |

---

## 3. Enums

```ts
// packages/tenant-gateway/src/entities/enums.ts

/**
 * Kết cục 1 transaction — chỉ 2 state đơn giản.
 *
 * - `Success` = tenant trả `success: true` ở item / single (bao gồm cả
 *   `duplicate: true` — idempotent replay vẫn là thành công).
 * - `Failed` = mọi trường hợp còn lại: business reject (`success: false`),
 *   outer batch reject, timeout, network error, HTTP 4xx/5xx.
 *
 * Chi tiết lỗi (code, message, stack) tra cứu qua `responsePayload` + `errorCode`
 * + `errorMessage` trong doc. UI phân biệt bằng cách đọc `responsePayload`.
 */
export const TxLogStatus = {
  Success: "success",
  Failed: "failed",
} as const;

export type TxLogStatus = (typeof TxLogStatus)[keyof typeof TxLogStatus];

/**
 * Loại API được log.
 */
export const TxLogEventType = {
  /** `POST /transaction` — single. */
  Transaction: "transaction",
  /** `POST /transaction/batch` — batch (mỗi item = 1 doc riêng, chung `batchId`). */
  BatchTransaction: "batch_transaction",
} as const;

export type TxLogEventType = (typeof TxLogEventType)[keyof typeof TxLogEventType];
```

---

## 4. `TxLogDoc` — 1 doc / 1 transaction

### 4.1 Nguyên tắc

- **Single call**: 1 doc với `tx = request.tx`, `batchId = tx`.
- **Batch N items**: N docs, mỗi doc có `tx = item.tx` (unique per item), tất cả share cùng `batchId` (UUIDv7 sinh mới).
- Trong doc: `requestPayload` = **per-item payload** (`BatchTransactionItem` object) — KHÔNG lưu cả batch; `responsePayload` = **per-item result** (`BatchTransactionItemResult`) + `batchOuter` cho envelope info.
- Trường hợp outer batch fail / throw: vẫn insert N docs (1 per item gốc), `responsePayload = undefined`, `batchOuterError` chứa lý do chung.

### 4.2 Schema

```ts
// packages/tenant-gateway/src/entities/tx-log.ts

import type { TransactionErrorCode } from "../shared/types";
import type { TxLogEventType, TxLogStatus } from "./enums";

/**
 * Raw MongoDB document — collection `tx_logs` (DB `megawin-tenant`).
 *
 * ## Thiết kế
 *
 * **1 document = 1 transaction.** Tìm kiếm/audit theo `tx` luôn trả về đúng
 * 1 record. Batch N items → N docs riêng, nhóm lại qua `batchId`.
 *
 * Payload raw JSON (`Record<string, unknown>`) — generic cho mọi game/product,
 * không phụ thuộc schema cụ thể.
 *
 * Log chỉ ghi **sau khi nhận response** (hoặc khi exception). 1 DB call / 1
 * transaction — không có pre-request write.
 *
 * ## Indexes (xem §7)
 *
 * - `{ tx: 1 }` unique — tra cứu chính xác + chống duplicate insert.
 * - `{ batchId: 1 }` — group items cùng batch.
 * - `{ createdAt: -1 }` — list sort newest-first.
 * - `{ tenantId: 1, createdAt: -1 }` — filter theo tenant.
 * - `{ status: 1, createdAt: -1 }` — UI lọc "chỉ xem failed".
 * - `{ expiresAt: 1 }` TTL — auto-delete sau 90 ngày.
 */
export interface TxLogDoc {
  _id: unknown;

  // ── Event identity ────────────────────────────────────────────
  /** Loại API. Xem {@link TxLogEventType}. */
  eventType: TxLogEventType;

  /**
   * Idempotency key của transaction — UUIDv7.
   * - Single: = `request.tx`.
   * - Batch item: = `item.tx`.
   *
   * Unique index → chống duplicate insert nếu logger bị gọi lại với cùng tx.
   */
  tx: string;

  /**
   * Group key của HTTP call.
   * - Single: = `tx` (1 call = 1 item).
   * - Batch: UUIDv7 mới, tất cả N items share giá trị này.
   *
   * Cho phép drill "xem tất cả items trong cùng batch call".
   */
  batchId: string;

  // ── Routing ───────────────────────────────────────────────────
  /** Tenant đích. */
  tenantId: string;

  // ── Request / Response — raw evidence ─────────────────────────
  /**
   * Payload gửi đi — full JSON.
   *
   * - Single: `TransactionRequest` shape `{ action, reason, tx, playerId,
   *   amount, currency, gameId?, roundIds?, description?, force?, metadata? }`.
   * - Batch item: `BatchTransactionItem` shape — chỉ phần item này, không
   *   phải cả batch. Tránh duplicate storage N lần.
   */
  requestPayload: Record<string, unknown>;

  /**
   * Response từ tenant — per-item.
   *
   * - Single success: full `TransactionResponse` (`{ success: true, data: {...} }`).
   * - Single fail: full `TransactionResponse` (`{ success: false, error: {...} }`).
   * - Batch item: `BatchTransactionItemResult` object cho item này.
   * - Timeout / network error / batch outer fail: `undefined`.
   * - HTTP 4xx/5xx non-JSON: `{ __raw: string, __parseError: true }`.
   */
  responsePayload?: Record<string, unknown>;

  /**
   * Batch outer envelope info — chỉ khi `eventType = BatchTransaction`.
   *
   * Giúp phân biệt: "item fail vì outer batch bị tenant reject toàn bộ" vs
   * "item fail vì business error per-item". Single event KHÔNG có field này.
   */
  batchOuter?: {
    /** Tenant trả `success: true` ở outer envelope? */
    success: boolean;
    /** Outer error khi `success: false` (auth fail, payload invalid, ...). */
    error?: { code: string; message: string };
  };

  // ── HTTP ───────────────────────────────────────────────────────
  /**
   * HTTP status code của response.
   * - 200 khi tenant trả envelope bình thường (success hoặc business fail).
   * - 4xx/5xx khi `HttpError`.
   * - `undefined` khi timeout / network error (chưa có response).
   */
  httpStatus?: number;

  // ── Result ─────────────────────────────────────────────────────
  /** `success` hoặc `failed`. Xem {@link TxLogStatus}. */
  status: TxLogStatus;

  /**
   * Error code khi `status = failed`:
   * - Business fail per-item: `response.error.code` (vd `INSUFFICIENT_BALANCE`).
   * - Outer batch fail: `batchOuter.error.code`.
   * - HTTP: `"HTTP_500"`, `"HTTP_502"`, …
   * - Timeout: `"TIMEOUT"`.
   * - Network: `"ECONNREFUSED"`, `"ENOTFOUND"`, `"ECONNRESET"`, …
   *
   * KHÔNG có khi `status = success`.
   */
  errorCode?: TransactionErrorCode | string;

  /** Error message human-readable. KHÔNG có khi success. */
  errorMessage?: string;

  // ── Timestamps ─────────────────────────────────────────────────
  /** Thời điểm log được ghi (~ sau khi nhận response / exception). */
  createdAt: Date;

  /** TTL — auto-delete sau 90 ngày. */
  expiresAt: Date;
}

/** Entity sau khi qua mapper. */
export interface TxLogEntity extends Omit<TxLogDoc, "_id"> {
  id: string;
}

/** Input cho insert — không có `_id`. */
export type TxLogInput = Omit<TxLogDoc, "_id">;
```

### 4.3 Tổng kết 12 field top-level

| Field | Kiểu | Bắt buộc | Ý nghĩa |
|-------|------|----------|---------|
| `_id` | ObjectId | ✓ | Mongo auto. |
| `eventType` | `TxLogEventType` | ✓ | single / batch. |
| `tx` | string (UUIDv7) | ✓ unique | Idempotency key. |
| `batchId` | string | ✓ | Group per HTTP call. |
| `tenantId` | string | ✓ | Partition. |
| `requestPayload` | JSON | ✓ | Raw evidence. |
| `responsePayload` | JSON \| undefined | — | Raw response (nếu có). |
| `batchOuter` | `{ success, error? }` \| undefined | — | Chỉ batch event. |
| `httpStatus` | number \| undefined | — | 200 / 4xx / 5xx. |
| `status` | `"success" \| "failed"` | ✓ | Filter chính. |
| `errorCode` | string \| undefined | — | Code khi failed. |
| `errorMessage` | string \| undefined | — | Message khi failed. |
| `createdAt` | Date | ✓ | Sort + TTL anchor. |
| `expiresAt` | Date | ✓ | TTL auto-delete. |

---

## 5. Mapper + Base Repo

```ts
// packages/tenant-gateway/src/infras/mappers/tx-log-mapper.ts

import { MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";
import type { TxLogEntity } from "../../entities";

export class TxLogMapper extends MongoMapper<Document, TxLogEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TxLogEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as TxLogEntity;
  }
}
```

```ts
// packages/tenant-gateway/src/infras/base-repo.ts

import { MongoRepository, MongoMapper, Constants } from "@megawin/data/mongo";
import type { BaseEntity } from "@megawin/data/mongo";
import type { Document } from "mongodb";

/**
 * Base repo cho collection thuộc DB `megawin-tenant` trong package `tenant-gateway`.
 *
 * DÙNG CHO: `tx_logs`.
 * KHÔNG DÙNG CHO: `TenantCallbackConfigRepo` (DB `megawin`, giữ nguyên).
 */
export class TenantGatewayBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TDataMapper> {
  constructor({ collName, dataMapper }: { collName: string; dataMapper?: TDataMapper }) {
    super({
      collName,
      dbName: Constants.Default.MegawinTenantDbName,
      dataMapper,
    });
  }
}
```

---

## 6. Repository

### 6.1 Types — tách riêng file

```ts
// packages/tenant-gateway/src/infras/repos/types/tx-log.types.ts

import type { TxLogStatus, TxLogEventType } from "../../../entities/enums";

/**
 * Filter cho UI list — search theo tx chính xác hoặc khoảng thời gian + status.
 *
 * Ưu tiên khi có cả `tx` và `from/to`: dùng `tx` trước (index lookup chính xác),
 * range bị ignore để tránh miss record.
 */
export interface ListTxLogsFilter {
  /** Exact match `tx`. */
  tx?: string;
  /** Range `createdAt >= from`. */
  from?: Date;
  /** Range `createdAt <= to`. */
  to?: Date;
  /** `"success"` hoặc `"failed"`. */
  status?: TxLogStatus;
  tenantId?: string;
  eventType?: TxLogEventType;
  batchId?: string;
}

export interface ListTxLogsOptions {
  /** Max 100. Default 50. */
  limit: number;
  /** Cursor-based, sort `createdAt DESC, _id DESC`. */
  cursor?: { createdAt: Date; id: string } | null;
}
```

```ts
// packages/tenant-gateway/src/infras/repos/types/index.ts
export * from "./tx-log.types";
```

### 6.2 Repository

```ts
// packages/tenant-gateway/src/infras/repos/tx-log-repo.ts

import { ObjectId, type Filter, type Sort } from "mongodb";
import { TenantGatewayBaseRepo } from "../base-repo";
import { TxLogMapper } from "../mappers";
import type { TxLogDoc, TxLogEntity, TxLogInput } from "../../entities";
import type { ListTxLogsFilter, ListTxLogsOptions } from "./types";

/**
 * Repository cho collection `tx_logs` (DB `megawin-tenant`).
 *
 * ## Contract
 *
 * - `insertLog` / `insertLogs` **fire-and-forget**: swallow mọi lỗi +
 *   `console.error`. KHÔNG throw ra caller — log fail không block dispatch.
 * - Read method (`listLogs`, `findByTx`, `findByBatchId`) dùng cho Backoffice
 *   — throw bình thường.
 */
export class TxLogRepository extends TenantGatewayBaseRepo<TxLogEntity, TxLogMapper> {
  constructor() {
    super({ collName: "tx_logs", dataMapper: new TxLogMapper() });
  }

  /** Fire-and-forget insert 1 doc (single transaction). */
  async insertLog(input: TxLogInput): Promise<void> {
    try {
      await this.insertOne(input);
    } catch (err) {
      // Unique index trên `tx` có thể throw E11000 khi logger bị chạy 2 lần
      // cho cùng tx (vd retry HTTP-level). Ignore — không block caller.
      console.error("[tx-log] insert failed:", err);
    }
  }

  /** Fire-and-forget bulk insert (batch N items = N docs). */
  async insertLogs(inputs: TxLogInput[]): Promise<void> {
    if (inputs.length === 0) return;
    try {
      await this.insertMany(inputs, { ordered: false });
    } catch (err) {
      console.error("[tx-log] bulk insert failed:", err);
    }
  }

  /**
   * Lookup exact theo `tx` — unique, trả 0 hoặc 1 record.
   */
  async findByTx(tx: string): Promise<TxLogEntity | null> {
    return await this.findOne({ tx });
  }

  /**
   * Trả tất cả items thuộc cùng 1 batch (hoặc 1 doc nếu single).
   * Sort theo `createdAt` ASC để đúng thứ tự insert.
   */
  async findByBatchId(batchId: string): Promise<TxLogEntity[]> {
    return await this.find({ batchId }, { sort: { createdAt: 1 } });
  }

  /**
   * List logs cho UI — cursor paginate, sort newest-first.
   */
  async listLogs(
    filter: ListTxLogsFilter,
    options: ListTxLogsOptions,
  ): Promise<{
    data: TxLogEntity[];
    nextCursor: { createdAt: string; id: string } | null;
  }> {
    const mongoFilter = this.buildFilter(filter, options.cursor);
    const sort: Sort = { createdAt: -1, _id: -1 };
    const limit = options.limit;

    const docs = await this.find(mongoFilter, { sort, limit: limit + 1 });
    const hasMore = docs.length > limit;
    const sliced = hasMore ? docs.slice(0, limit) : docs;
    const last = sliced[sliced.length - 1];
    const nextCursor = hasMore && last
      ? { createdAt: last.createdAt.toISOString(), id: last.id }
      : null;
    return { data: sliced, nextCursor };
  }

  private buildFilter(
    filter: ListTxLogsFilter,
    cursor: ListTxLogsOptions["cursor"],
  ): Filter<TxLogDoc> {
    const conditions: Filter<TxLogDoc>[] = [];

    // Exact tx search — ưu tiên, range bị ignore khi có.
    if (filter.tx) {
      conditions.push({ tx: filter.tx });
    } else {
      if (filter.from || filter.to) {
        const range: Record<string, Date> = {};
        if (filter.from) range.$gte = filter.from;
        if (filter.to) range.$lte = filter.to;
        conditions.push({ createdAt: range as any });
      }
    }

    if (filter.status) conditions.push({ status: filter.status });
    if (filter.tenantId) conditions.push({ tenantId: filter.tenantId });
    if (filter.eventType) conditions.push({ eventType: filter.eventType });
    if (filter.batchId) conditions.push({ batchId: filter.batchId });

    if (cursor) {
      conditions.push({
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            _id: { $lt: new ObjectId(cursor.id) } as any,
          },
        ],
      });
    }

    return conditions.length === 0
      ? {}
      : conditions.length === 1
        ? conditions[0]!
        : { $and: conditions };
  }
}
```

### 6.3 Barrels

```ts
// packages/tenant-gateway/src/infras/repos/index.ts
export * from "./tenant-callback-config-repo";
export * from "./tx-log-repo";
export * from "./types";

// packages/tenant-gateway/src/infras/mappers/index.ts
export * from "./tx-log-mapper";

// packages/tenant-gateway/src/entities/index.ts
export * from "./enums";
export * from "./tx-log";
```

---

## 7. Indexes

```ts
// packages/tenant-gateway/src/infras/indexes/tx-log-indexes.ts

import type { IndexDescription } from "mongodb";

/**
 * Indexes cho collection `tx_logs` (DB `megawin-tenant`).
 */
export const TX_LOG_INDEXES: ReadonlyArray<IndexDescription> = [
  // Unique — tra cứu tx chính xác + chống duplicate insert.
  { key: { tx: 1 }, name: "tx_unique", unique: true },

  // Group per HTTP batch call.
  { key: { batchId: 1 }, name: "batchId" },

  // List default sort khi không filter.
  { key: { createdAt: -1 }, name: "createdAt" },

  // Filter theo tenant.
  { key: { tenantId: 1, createdAt: -1 }, name: "tenantId_createdAt" },

  // UI "chỉ xem failed".
  { key: { status: 1, createdAt: -1 }, name: "status_createdAt" },

  // TTL — auto-delete sau 90 ngày.
  { key: { expiresAt: 1 }, name: "ttl_expiresAt", expireAfterSeconds: 0 },
];
```

---

## 8. Classifier + Logger — Fire-and-Forget

### 8.1 Classifier

```ts
// packages/tenant-gateway/src/shared/tx-log-classifier.ts

import { ApiClientError } from "@megawin/http-client";
import { TxLogStatus } from "../entities/enums";

export interface ClassifiedOutcome {
  status: TxLogStatus;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Classify 1 item result (single transaction hoặc batch item).
 *
 * Rule:
 * - success=true → Success (bao gồm duplicate=true, duplicate vẫn là thành công).
 * - success=false → Failed + error.code/message từ response.
 */
export function classifyItem(item: {
  success: boolean;
  error?: { code: string; message: string };
}): ClassifiedOutcome {
  if (item.success) return { status: TxLogStatus.Success };
  return {
    status: TxLogStatus.Failed,
    errorCode: item.error?.code,
    errorMessage: item.error?.message,
  };
}

/**
 * Classify exception throw từ HttpClient.
 *
 * Rule (ordering):
 * 1. `ApiClientError` với httpStatus → Failed + `HTTP_<status>` + parse body.
 * 2. Name/message match timeout/aborted → Failed + `TIMEOUT`.
 * 3. Default → Failed + `err.code` hoặc `NETWORK_ERROR`.
 */
export function classifyThrown(err: unknown): {
  outcome: ClassifiedOutcome;
  httpStatus?: number;
  responsePayload?: Record<string, unknown>;
} {
  const anyErr = err as any;
  const message = typeof anyErr?.message === "string" ? anyErr.message : String(err);

  if (err instanceof ApiClientError && typeof anyErr.httpStatus === "number") {
    const status = anyErr.httpStatus as number;
    return {
      outcome: {
        status: TxLogStatus.Failed,
        errorCode: `HTTP_${status}`,
        errorMessage: message,
      },
      httpStatus: status,
      responsePayload: tryParseRawBody(anyErr.responseBody),
    };
  }

  const name = typeof anyErr?.name === "string" ? anyErr.name : "";
  if (/timeout|aborterror|aborted/i.test(name) || /timeout|aborted/i.test(message)) {
    return {
      outcome: { status: TxLogStatus.Failed, errorCode: "TIMEOUT", errorMessage: message },
    };
  }

  const code = typeof anyErr?.code === "string" ? anyErr.code : "NETWORK_ERROR";
  return { outcome: { status: TxLogStatus.Failed, errorCode: code, errorMessage: message } };
}

function tryParseRawBody(body: unknown): Record<string, unknown> | undefined {
  if (body == null) return undefined;
  if (typeof body === "object") return body as Record<string, unknown>;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return { __raw: body, __parseError: true };
    }
  }
  return undefined;
}
```

### 8.2 Logger

```ts
// packages/tenant-gateway/src/shared/tx-logger.ts

import { TxLogRepository } from "../infras/repos";
import type { TxLogInput } from "../entities";

const RETENTION_MS = 90 * 86_400_000;

const repo = new TxLogRepository();

/**
 * Fire-and-forget log 1 doc. Tự điền `createdAt` + `expiresAt`.
 */
export async function logTx(input: Omit<TxLogInput, "createdAt" | "expiresAt">): Promise<void> {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + RETENTION_MS);
  await repo.insertLog({ ...input, createdAt, expiresAt });
}

/**
 * Fire-and-forget bulk log N docs (batch). Tự điền timestamps chung.
 */
export async function logTxBulk(
  inputs: Array<Omit<TxLogInput, "createdAt" | "expiresAt">>,
): Promise<void> {
  if (inputs.length === 0) return;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + RETENTION_MS);
  const docs: TxLogInput[] = inputs.map((i) => ({ ...i, createdAt, expiresAt }));
  await repo.insertLogs(docs);
}
```

---

## 9. Integration — wrap `transaction-api.ts`

### 9.1 Chiến lược

- **Chỉ log sau response / exception** — 1 DB call / transaction.
- **Batch N items → N docs**, cùng `batchId` (UUIDv7 sinh tại wrap).
- `requestPayload` batch = `BatchTransactionItem` của chính item (KHÔNG lưu cả batch).
- `responsePayload` batch = `BatchTransactionItemResult` của item.
- Outer batch fail (throw hoặc `success: false` outer) → vẫn ghi N docs với `responsePayload: undefined`, `batchOuter.success: false` + `batchOuter.error`.

### 9.2 Pseudo-code

```ts
// packages/tenant-gateway/src/transaction/transaction-api.ts

import { randomUUID } from "node:crypto";
import { logTx, logTxBulk } from "../shared/tx-logger";
import { classifyItem, classifyThrown } from "../shared/tx-log-classifier";
import { TxLogEventType, TxLogStatus } from "../entities/enums";

export function createTransactionApi(http: HttpClient, tenantId: string): TransactionApi {
  return {
    async transaction(req) {
      try {
        const response = await http.post<TransactionResponse>(
          CALLBACK_PATHS.transaction,
          req,
          { rawResponse: true },
        );
        const outcome = classifyItem({ success: !!response.success, error: response.error });
        void logTx({
          eventType: TxLogEventType.Transaction,
          tx: req.tx,
          batchId: req.tx,
          tenantId,
          requestPayload: req as any,
          responsePayload: response as any,
          httpStatus: 200,
          ...outcome,
        });
        return response;
      } catch (err) {
        const { outcome, httpStatus, responsePayload } = classifyThrown(err);
        void logTx({
          eventType: TxLogEventType.Transaction,
          tx: req.tx,
          batchId: req.tx,
          tenantId,
          requestPayload: req as any,
          responsePayload,
          httpStatus,
          ...outcome,
        });
        throw err;
      }
    },

    async batchTransaction(req) {
      const batchId = randomUUID();
      try {
        const response = await http.post<BatchTransactionResponse>(
          CALLBACK_PATHS.batchTransaction,
          req,
          { rawResponse: true },
        );

        // Outer batch fail → N docs với cùng outer error.
        if (!response.success) {
          const docs = req.items.map((item) => ({
            eventType: TxLogEventType.BatchTransaction,
            tx: item.tx,
            batchId,
            tenantId,
            requestPayload: item as any,
            responsePayload: undefined,
            batchOuter: {
              success: false,
              error: response.error
                ? { code: response.error.code, message: response.error.message }
                : undefined,
            },
            httpStatus: 200,
            status: TxLogStatus.Failed,
            errorCode: response.error?.code,
            errorMessage: response.error?.message,
          }));
          void logTxBulk(docs);
          return response;
        }

        // Outer success → N docs, mỗi doc classify từ item result tương ứng.
        const resultMap = new Map(
          (response.data?.results ?? []).map((r) => [r.tx, r]),
        );
        const docs = req.items.map((item) => {
          const result = resultMap.get(item.tx);
          const outcome = result
            ? classifyItem({ success: result.success, error: result.error })
            : {
                status: TxLogStatus.Failed,
                errorCode: "MISSING_RESULT",
                errorMessage: "Tenant response thiếu result cho tx này",
              };
          return {
            eventType: TxLogEventType.BatchTransaction,
            tx: item.tx,
            batchId,
            tenantId,
            requestPayload: item as any,
            responsePayload: result as any,
            batchOuter: { success: true },
            httpStatus: 200,
            ...outcome,
          };
        });
        void logTxBulk(docs);
        return response;
      } catch (err) {
        // Transport error → N docs failed, chung outer info.
        const { outcome, httpStatus, responsePayload } = classifyThrown(err);
        const docs = req.items.map((item) => ({
          eventType: TxLogEventType.BatchTransaction,
          tx: item.tx,
          batchId,
          tenantId,
          requestPayload: item as any,
          responsePayload,
          batchOuter: {
            success: false,
            error: { code: outcome.errorCode ?? "NETWORK_ERROR", message: outcome.errorMessage ?? "" },
          },
          httpStatus,
          ...outcome,
        }));
        void logTxBulk(docs);
        throw err;
      }
    },

    checkTransactionStatus(tx) {
      const path = CALLBACK_PATHS.transactionStatus.replace(":tx", tx);
      return http.get<TransactionStatusResponse>(path, { rawResponse: true });
    },
  };
}
```

### 9.3 Update `client.ts`

```ts
- const transactionApi = createTransactionApi(authedClient);
+ const transactionApi = createTransactionApi(authedClient, config.tenantId);
```

---

## 10. Use Cases — trong `tenant-gateway`

Theo feedback: **không tạo package riêng**. Đặt use-cases trong `packages/tenant-gateway/src/use-cases/tx-logs/`, export qua subpath `@megawin/tenant-gateway/use-cases/tx-logs`.

### 10.1 Cấu trúc

```
packages/tenant-gateway/src/use-cases/
└── tx-logs/
    ├── index.ts
    ├── types.ts
    ├── list-tx-logs.ts
    └── get-tx-log-by-tx.ts
```

### 10.2 Types

```ts
// packages/tenant-gateway/src/use-cases/tx-logs/types.ts

import type { TxLogEntity } from "../../entities";
import type { TxLogStatus, TxLogEventType } from "../../entities/enums";

export interface ListTxLogsInput {
  /** Exact tx. Khi có → bỏ qua `from/to`. */
  tx?: string;
  /** Range start (ISO datetime). */
  from?: string;
  /** Range end (ISO datetime). */
  to?: string;
  status?: TxLogStatus;
  tenantId?: string;
  eventType?: TxLogEventType;
  batchId?: string;
  cursor?: { createdAt: string; id: string } | null;
  limit?: number;
}

export interface ListTxLogsOutput {
  data: TxLogEntity[];
  nextCursor: { createdAt: string; id: string } | null;
}

export interface GetTxLogByTxInput {
  tx: string;
}

export interface GetTxLogByTxOutput {
  /** Trả record của tx + tất cả items cùng `batchId` để UI hiển thị context batch. */
  log: TxLogEntity | null;
  siblings: TxLogEntity[];
}
```

### 10.3 `ListTxLogsUseCase`

```ts
// packages/tenant-gateway/src/use-cases/tx-logs/list-tx-logs.ts

import { NextApiUseCase } from "@megawin/next/server";
import { TxLogRepository } from "../../infras/repos";
import type { ListTxLogsInput, ListTxLogsOutput } from "./types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_RANGE_DAYS = 31;

/**
 * List tx logs cho Backoffice. Sort newest-first, cursor paginate.
 *
 * Filter:
 * - `tx` exact → bỏ qua range (tra cứu chính xác).
 * - `from/to` range (tối đa 31 ngày) + `status`/`tenantId`/`eventType` combine.
 *
 * Ràng buộc:
 * - `from` không được cũ hơn 90 ngày (ngoài retention).
 * - Range > 31 ngày → throw (tránh scan quá rộng).
 */
export class ListTxLogsUseCase extends NextApiUseCase<ListTxLogsInput, ListTxLogsOutput> {
  private readonly repo = new TxLogRepository();

  protected async execute(input: ListTxLogsInput): Promise<ListTxLogsOutput> {
    const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = input.cursor
      ? { createdAt: new Date(input.cursor.createdAt), id: input.cursor.id }
      : null;

    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;

    if (!input.tx && from && to) {
      this.validateRange(from, to);
    }

    return await this.repo.listLogs(
      {
        tx: input.tx,
        from,
        to,
        status: input.status,
        tenantId: input.tenantId,
        eventType: input.eventType,
        batchId: input.batchId,
      },
      { limit, cursor },
    );
  }

  private validateRange(from: Date, to: Date): void {
    if (from > to) throw new Error("BAD_RANGE: from > to");
    const now = Date.now();
    const retentionFloor = now - 90 * 86_400_000;
    if (from.getTime() < retentionFloor) {
      throw new Error("BAD_RANGE: from ngoài retention 90 ngày");
    }
    const rangeDays = (to.getTime() - from.getTime()) / 86_400_000;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new Error(`BAD_RANGE: range vượt quá ${MAX_RANGE_DAYS} ngày`);
    }
  }
}
```

### 10.4 `GetTxLogByTxUseCase`

```ts
// packages/tenant-gateway/src/use-cases/tx-logs/get-tx-log-by-tx.ts

import { NextApiUseCase } from "@megawin/next/server";
import { TxLogRepository } from "../../infras/repos";
import type { GetTxLogByTxInput, GetTxLogByTxOutput } from "./types";

/**
 * Tra cứu 1 tx. Trả:
 * - `log`: record của tx (unique, có thể null nếu không tồn tại / đã TTL).
 * - `siblings`: các items khác cùng batch (khi `log.eventType = batch_transaction`).
 */
export class GetTxLogByTxUseCase extends NextApiUseCase<GetTxLogByTxInput, GetTxLogByTxOutput> {
  private readonly repo = new TxLogRepository();

  protected async execute(input: GetTxLogByTxInput): Promise<GetTxLogByTxOutput> {
    const log = await this.repo.findByTx(input.tx);
    if (!log) return { log: null, siblings: [] };

    if (log.eventType === "transaction") {
      return { log, siblings: [] };
    }

    const batch = await this.repo.findByBatchId(log.batchId);
    const siblings = batch.filter((b) => b.id !== log.id);
    return { log, siblings };
  }
}
```

### 10.5 Barrels

```ts
// packages/tenant-gateway/src/use-cases/tx-logs/index.ts
export * from "./types";
export * from "./list-tx-logs";
export * from "./get-tx-log-by-tx";
```

### 10.6 Subpath export — `package.json`

```json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts",
      "default": "./dist/index.js"
    },
    "./use-cases/tx-logs": {
      "types": "./src/use-cases/tx-logs/index.ts",
      "import": "./src/use-cases/tx-logs/index.ts",
      "default": "./dist/use-cases/tx-logs/index.js"
    }
  }
}
```

---

## 11. Backoffice — API Routes

```
apps/backoffice/src/app/api/tenant-logs/transactions/
├── route.ts              ← GET list + filter
└── [tx]/route.ts         ← GET detail (log + siblings)
```

### 11.1 List route

```ts
// apps/backoffice/src/app/api/tenant-logs/transactions/route.ts

import { z } from "zod";
import { withApi } from "@megawin/next/server";
import { CompanyRole } from "@megawin/shared/roles";
import {
  ListTxLogsUseCase,
  type ListTxLogsInput,
} from "@megawin/tenant-gateway/use-cases/tx-logs";
import { TxLogStatus, TxLogEventType } from "@megawin/tenant-gateway";

const querySchema = z.object({
  tx: z.string().trim().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.nativeEnum(TxLogStatus).optional(),
  tenantId: z.string().optional(),
  eventType: z.nativeEnum(TxLogEventType).optional(),
  batchId: z.string().optional(),
  cursorCreatedAt: z.string().datetime().optional(),
  cursorId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const useCase = new ListTxLogsUseCase();

export const GET = withApi({
  auth: { roles: [CompanyRole.Staff, CompanyRole.Admin] },
  querySchema,
  handler: async ({ query }) => {
    const input: ListTxLogsInput = {
      tx: query.tx,
      from: query.from,
      to: query.to,
      status: query.status,
      tenantId: query.tenantId,
      eventType: query.eventType,
      batchId: query.batchId,
      limit: query.limit,
      cursor:
        query.cursorCreatedAt && query.cursorId
          ? { createdAt: query.cursorCreatedAt, id: query.cursorId }
          : null,
    };
    return await useCase.run(input);
  },
});
```

### 11.2 Detail route

```ts
// apps/backoffice/src/app/api/tenant-logs/transactions/[tx]/route.ts

import { z } from "zod";
import { withApi } from "@megawin/next/server";
import { CompanyRole } from "@megawin/shared/roles";
import { GetTxLogByTxUseCase } from "@megawin/tenant-gateway/use-cases/tx-logs";

const paramsSchema = z.object({ tx: z.string().trim().min(1) });
const useCase = new GetTxLogByTxUseCase();

export const GET = withApi({
  auth: { roles: [CompanyRole.Staff, CompanyRole.Admin] },
  paramsSchema,
  handler: async ({ params }) => await useCase.run({ tx: params.tx }),
});
```

Cú pháp `withApi` thực tế phụ thuộc helper hiện có của `@megawin/next/server` — điều chỉnh khi implement.

---

## 12. Backoffice — UI

### 12.1 Sidebar

Thêm item vào group "Báo cáo":

```ts
{
  title: "Nhật ký giao dịch",
  url: "/reports/tenant-transactions",
  icon: FileClock,
  roles: [CompanyRole.Staff],
},
```

### 12.2 Page structure

```
apps/backoffice/src/app/(main)/reports/tenant-transactions/
├── page.tsx                       ← Suspense wrapper
├── _components/
│   ├── tx-log-content.tsx         ← Orchestrator
│   ├── tx-log-filter-bar.tsx      ← Filter: tx | date range + status
│   ├── tx-log-table.tsx           ← DataTable + infinite scroll
│   └── tx-log-detail-drawer.tsx   ← Right drawer
└── _lib/
    ├── use-filters.ts             ← nuqs URL state
    └── use-queries.ts             ← React Query hooks
```

### 12.3 Filter bar — 2 mode

| Mode | UI | Xử lý |
|------|-----|-------|
| **By tx** | Input "Tx ID" (exact match) | Khi nhập → disable date range + status controls. Search trực tiếp, 1 result. |
| **By range** | Date range picker + Select status (`Tất cả / Thành công / Thất bại`) | Khi không có tx → range + status enforce. |

Ràng buộc:
- `from >= today - 90 days`, `to <= today`, `range <= 31 ngày`.
- Default: `from = today - 7`, `to = today`, `status = Tất cả`.
- Helper text dưới date picker: _"Lưu trữ tối đa 3 tháng. Khoảng chọn tối đa 31 ngày."_

### 12.4 URL state (nuqs)

```
/reports/tenant-transactions
  ?tx=<uuid>                      // mode 1
  // OR
  ?from=2026-04-01&to=2026-04-29&status=failed   // mode 2
  ?detail=<tx>                    // open drawer
```

### 12.5 Table columns

Theo rule `frontend-dev.mdc` §1.7 / §1.7a:

| Cột | Width | Content | Class |
|-----|-------|---------|-------|
| Thời gian | 170px | `displayVNDateTime(createdAt)` | `pl-5 text-xs font-mono tabular-nums` |
| Status | 110px | Badge `success` (green) / `failed` (red) | `text-xs` |
| Event | 90px | `Single` / `Batch` | `text-xs` |
| Tenant | 120px | `tenantId` | `text-xs` |
| Tx | 280px | `tx` monospace + copy icon | `text-xs font-mono` |
| BatchId | 100px | `batchId` short (8 chars) + icon khi batch | `text-xs font-mono text-muted-foreground` |
| HTTP | 60px | `httpStatus` hoặc `—` | `text-right tabular-nums` |
| Error | 240px | `errorCode` + truncate `errorMessage` | `pr-5 text-xs text-muted-foreground` |

Click row → drawer.

### 12.6 Drawer content

- **Header**: badge status + eventType + tenant + `displayVNDateTime(createdAt)`.
- **Identity**: `tx`, `batchId` (copy button), `httpStatus`.
- **Error box** (khi failed): `errorCode` + `errorMessage` + `batchOuter.error` nếu có.
- **Request section**: pretty-printed JSON `requestPayload` (copy button).
- **Response section**: pretty-printed JSON `responsePayload` (copy button) — hoặc empty state "Không có response (timeout/network error)".
- **Siblings** (chỉ batch): bảng N-1 items cùng `batchId` — columns: Tx · Status · Action (từ `requestPayload.action`) · Player · Amount · Error. Click → chuyển sang tx đó.

### 12.7 Labels

```ts
// packages/tenant-gateway/src/labels/index.ts

import { TxLogStatus, TxLogEventType } from "../entities/enums";

export const TX_LOG_STATUS_LABELS: Record<TxLogStatus, string> = {
  success: "Thành công",
  failed: "Thất bại",
};

export const TX_LOG_STATUS_VARIANT: Record<
  TxLogStatus,
  "default" | "destructive"
> = {
  success: "default",
  failed: "destructive",
};

export const TX_LOG_EVENT_TYPE_LABELS: Record<TxLogEventType, string> = {
  transaction: "Single",
  batch_transaction: "Batch",
};
```

---

## 13. React Query hooks

```ts
// _lib/use-queries.ts

export const txLogKeys = {
  all: ["tx-logs"] as const,
  list: (filters: object) => [...txLogKeys.all, "list", filters] as const,
  byTx: (tx: string) => [...txLogKeys.all, "tx", tx] as const,
};

export function useTxLogList(filters: {
  tx?: string;
  from?: string;
  to?: string;
  status?: string;
}) {
  return useInfiniteQuery({
    queryKey: txLogKeys.list(filters),
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.tx) params.set("tx", filters.tx);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.status) params.set("status", filters.status);
      if (pageParam) {
        params.set("cursorCreatedAt", pageParam.createdAt);
        params.set("cursorId", pageParam.id);
      }
      const res = await fetch(`/api/tenant-logs/transactions?${params}`);
      if (!res.ok) throw new Error("list failed");
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 10_000,
  });
}

export function useTxLogDetail(tx: string | null) {
  return useQuery({
    queryKey: tx ? txLogKeys.byTx(tx) : txLogKeys.all,
    enabled: !!tx,
    queryFn: async () => {
      const res = await fetch(`/api/tenant-logs/transactions/${tx}`);
      if (!res.ok) throw new Error("detail failed");
      return res.json();
    },
  });
}
```

---

## 14. Retention & Security

### 14.1 Retention

- Logger stamp `expiresAt = createdAt + 90 days`.
- TTL index trên `expiresAt`.
- API enforce `from >= today - 90d` (return 400 khi vi phạm).
- UI date picker min/max.

### 14.2 Payload cap (defensive)

Trong `logTx` / `logTxBulk`, nếu `JSON.stringify(payload).length > 100_000` → thay bằng `{ __truncated: true, __size: N }`. Hầu hết payload < 2KB.

### 14.3 Security

| Concern | Xử lý |
|---------|-------|
| API key | Không lưu — chỉ có trong HttpClient header. Verify `responseBody` trong `ApiClientError` không chứa request header. |
| Role | Routes check `CompanyRole.Staff+`. |
| Player ID | `playerId` nằm trong `requestPayload` — acceptable, tenant-side username. |

---

## 15. Migration & Rollout

1. **Migration**: apply `TX_LOG_INDEXES` vào `megawin-tenant.tx_logs`.
2. **Deploy `tenant-gateway`**: logger + classifier + wrap + use-cases. Log bắt đầu ghi ngay.
3. **Deploy BE routes**: `/api/tenant-logs/transactions` + `[tx]`.
4. **Deploy FE**: page + sidebar.
5. **Smoke**: 1 single transaction + 1 batch → confirm log doc xuất hiện với đúng `tx`, `batchId`, `status`.

---

## 16. Checklist implementation

- [ ] **Step 1** `packages/tenant-gateway/src/entities/enums.ts` — `TxLogStatus` (success|failed), `TxLogEventType`
- [ ] **Step 2** `packages/tenant-gateway/src/entities/tx-log.ts` — `TxLogDoc` / `TxLogEntity` / `TxLogInput`
- [ ] **Step 3** `packages/tenant-gateway/src/entities/index.ts` — barrel
- [ ] **Step 4** `packages/tenant-gateway/src/infras/base-repo.ts` — `TenantGatewayBaseRepo`
- [ ] **Step 5** `packages/tenant-gateway/src/infras/mappers/tx-log-mapper.ts` + barrel
- [ ] **Step 6** `packages/tenant-gateway/src/infras/repos/types/tx-log.types.ts` + barrel
- [ ] **Step 7** `packages/tenant-gateway/src/infras/repos/tx-log-repo.ts`
- [ ] **Step 8** `packages/tenant-gateway/src/infras/repos/index.ts` — re-export
- [ ] **Step 9** `packages/tenant-gateway/src/infras/indexes/tx-log-indexes.ts` — TX_LOG_INDEXES
- [ ] **Step 10** `packages/tenant-gateway/src/shared/tx-log-classifier.ts`
- [ ] **Step 11** `packages/tenant-gateway/src/shared/tx-logger.ts` — `logTx` + `logTxBulk`
- [ ] **Step 12** `packages/tenant-gateway/src/labels/index.ts` — labels
- [ ] **Step 13** `packages/tenant-gateway/src/transaction/transaction-api.ts` — wrap single + batch (N docs)
- [ ] **Step 14** `packages/tenant-gateway/src/client.ts` — pass `config.tenantId` to factory
- [ ] **Step 15** `packages/tenant-gateway/src/use-cases/tx-logs/` — types + `ListTxLogsUseCase` + `GetTxLogByTxUseCase` + barrel
- [ ] **Step 16** `packages/tenant-gateway/package.json` — subpath export `./use-cases/tx-logs`
- [ ] **Step 17** `packages/tenant-gateway/src/index.ts` — re-export entities + labels
- [ ] **Step 18** Migration script apply `TX_LOG_INDEXES` vào `megawin-tenant.tx_logs`
- [ ] **Step 19** `apps/backoffice/src/app/api/tenant-logs/transactions/route.ts`
- [ ] **Step 20** `apps/backoffice/src/app/api/tenant-logs/transactions/[tx]/route.ts`
- [ ] **Step 21** `apps/backoffice/src/navigation/sidebar/sidebar-items.ts` — add menu item
- [ ] **Step 22** FE page + filter bar + table + drawer + React Query hooks
- [ ] **Step 23** Smoke test — single + batch (partial fail) + timeout → verify correct `tx`, `batchId`, `status`, `responsePayload`

---

## 17. Acceptance criteria

- [x] 2 events `transaction` + `batch_transaction` log đầy đủ. `check_status` + `balance` KHÔNG log.
- [x] 1 transaction = 1 doc. Batch N items = N docs cùng `batchId`. Tra cứu theo `tx` luôn trả đúng 1 record.
- [x] Status chỉ `success` / `failed`. Chi tiết lỗi trong `responsePayload` + `errorCode` + `errorMessage`.
- [x] `requestPayload` / `responsePayload` raw JSON — generic cho mọi game. Payload tiến hoá (thêm `batchKey` tenant response) không cần sửa schema.
- [x] Chỉ 1 DB call / transaction (log sau response, không log pre-request).
- [x] Collection tên `tx_logs` trong DB `megawin-tenant`.
- [x] TTL 90 ngày — verify index.
- [x] Logger fail KHÔNG block dispatch / place-bet.
- [x] UI filter:
  - Mode "by tx": exact match, disable range/status.
  - Mode "by range": date picker + status selector (tất cả / success / failed). Range ≤ 31 ngày, ≤ 90 ngày retention.
- [x] Click row → drawer với full request/response + siblings cùng batchId khi batch event.
- [x] Role `CompanyRole.Staff+` mới truy cập.
- [x] Schema 12 field top-level (không duplicate thông tin đã có trong payload).







