# Tenant Transaction Logging — Thiết kế triển khai (v5)

> **Source**: `packages/tenant-gateway/to-dos/transaction-logging.md`
> **Status**: Planning — refactor round 5 (folder tenant-tx-logs, labels in shared, bỏ siblings, list-by-batch riêng, dùng shared pagination/date, bỏ `expiresAt`).
> **DB đích**: `megawin-tenant`
> **Collection**: `tx_logs` (đồng bộ convention với `tx_intents`)
> **Retention**: 3 tháng (90 ngày) — MongoDB TTL index trên `createdAt`.

---

## 1. Phạm vi

| API | Log? | Lý do |
|-----|------|-------|
| `POST /transaction` (single) | ✅ | Hot path debit/credit — critical. |
| `POST /transaction/batch` | ✅ | Payout/refund — critical. **1 doc / 1 item** trong batch. |
| `GET /transaction/:tx/status` | ❌ | Read-only probe. |
| `GET /balance` | ❌ | Read-only. |

---

## 2. Quyết định theo feedback

| # | Feedback | Quyết định |
|---|----------|------------|
| 1 | Dùng luôn use-case trong `tenant-gateway` | **Bỏ package `tenant-gateway-application`**. Use-cases đặt trong `packages/tenant-gateway/src/use-cases/tx-logs/` + export qua subpath `@megawin/tenant-gateway/use-cases/tx-logs`. |
| 2 | 1 doc / 1 item (batch chia N docs) | **Applied.** Mỗi item = 1 doc riêng có `tx` unique. Thêm `batchId` để nhóm items cùng call. |
| 3 | `batchId` cho batch | **Applied.** `batchId` = UUIDv7 sinh tại logger, bằng với `tx` khi single (giữ 1 field optional thay vì null khác biệt). |
| 4 | Status đơn giản `success \| failed` | **Applied.** Bỏ 6-state `TxLogStatus`, còn 2 state. Chi tiết lỗi đọc trong `responsePayload`. |
| 5 | Có cần `latencyMs`? | **Bỏ.** Chỉ log **sau khi nhận response** (hoặc throw) — 1 DB call duy nhất. `createdAt` = thời điểm log (~ thời điểm nhận response). Dispute/performance đo qua APM / CloudWatch, không phải DB field. |
| 6 | Tên collection | `tx_logs` (thay vì `transaction_logs`). |
| 7 | UI filter | Exact tx + date range + status (`success \| failed`). |
| 8 | `batchOuter` và `httpStatus` có cần không? | **Bỏ cả 2.** `batchOuter.success` chính là `status` của doc rồi (outer fail → tất cả items status=failed). `httpStatus` chỉ hữu ích khi failed → merge vào `error` object. Khi success thì không cần gì ngoài `responsePayload`. |
| 9 | API folder + route tên | **Đổi** sang `tenant-tx-logs`: `/api/tenant-tx-logs/...` và `(main)/reports/tenant-tx-logs/`. |
| 10 | Labels để ở đâu? | **Di chuyển** `packages/tenant-gateway/src/shared/labels/`. Label là kiến thức domain của `tx-log`, phải đi kèm package tenant-gateway để FE/BE chung 1 nguồn. |
| 11 | `GetTxLogByTxUseCase` trả siblings? | **Bỏ siblings.** Use-case chỉ trả đúng log của `tx` đó. UI muốn xem batch → click `batchId` → gọi API `list-by-batch` mới (có phân trang). |
| 12 | Pagination / date format | Dùng `Pagination` (`@megawin/shared/constants/pagination`) và `displayVNDateTime` (`@megawin/shared/utils/date`). KHÔNG tự định nghĩa lại. |
| 13 | `expiresAt` trong doc | **Bỏ.** TTL index chạy trên `createdAt` với `expireAfterSeconds = 90 * 86400`. Logger chỉ stamp `createdAt`. |

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
 * Chi tiết lỗi (code, message, httpStatus, batchOuterRejected) tra cứu qua
 * object `error` trên doc (chỉ có khi `status = failed`) + `responsePayload`.
 * UI phân biệt bằng cách đọc `error.code` / `error.batchOuterRejected`.
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
- **Batch N items**: N docs, mỗi doc có `tx = item.tx` (unique), cùng `batchId` (UUIDv7 sinh mới).
- `requestPayload` = per-item payload (`BatchTransactionItem` cho batch, `TransactionRequest` cho single).
- `responsePayload` = per-item result. `undefined` khi throw (timeout/network/HTTP error).
- `status = success` khi tenant trả `item.success: true` → KHÔNG có `error` field → document clean chỉ có request + response.
- `status = failed` → có `error` object chứa TẤT CẢ thông tin debug: `code`, `message`, `httpStatus?`, `batchOuterRejected?`.

### 4.2 Schema — gọn, chỉ giữ field nào cần query / filter

```ts
// packages/tenant-gateway/src/entities/tx-log.ts

import type { TransactionErrorCode } from "../shared/types";
import type { TxLogEventType, TxLogStatus } from "./enums";

/**
 * Chi tiết lỗi — CHỈ có khi `status = failed`.
 *
 * Tất cả thông tin debug tập trung ở đây, tránh optional field rải rác
 * ở top-level. Khi success → field `error` không tồn tại trong doc.
 *
 * ## Các nguồn lỗi & mapping
 *
 * | Nguồn                      | `code`                         | `httpStatus` | `batchOuterRejected` |
 * |----------------------------|--------------------------------|--------------|----------------------|
 * | Business reject per-item   | `response.error.code`          | 200          | —                    |
 * | Batch outer reject         | `response.error.code`          | 200          | `true`               |
 * | HTTP 4xx/5xx               | `"HTTP_<status>"`              | `<status>`   | —                    |
 * | Timeout                    | `"TIMEOUT"`                    | —            | —                    |
 * | Network (DNS, ECONNREFUSED)| `err.code` hoặc `"NETWORK_ERROR"` | —         | —                    |
 * | Batch item missing trong response | `"MISSING_RESULT"`      | 200          | —                    |
 */
export interface TxLogError {
  /**
   * Machine-readable code:
   * - Business fail: {@link TransactionErrorCode} (vd `INSUFFICIENT_BALANCE`).
   * - HTTP error: `"HTTP_500"`, `"HTTP_502"`, …
   * - Transport: `"TIMEOUT"`, `"ECONNREFUSED"`, `"ENOTFOUND"`, `"NETWORK_ERROR"`.
   */
  code: TransactionErrorCode | string;

  /** Human-readable message từ tenant hoặc từ exception. */
  message: string;

  /**
   * HTTP status code — CHỈ có khi lỗi phát sinh từ HTTP layer (4xx/5xx).
   * Business fail, timeout, network error KHÔNG có field này.
   */
  httpStatus?: number;

  /**
   * `true` khi lỗi này do tenant reject **toàn bộ batch** ở outer envelope
   * (`BatchTransactionResponse.success = false`).
   *
   * Giúp phân biệt "batch bị reject nên tất cả items failed" vs "item này
   * fail riêng theo business rule". Single event KHÔNG có field này.
   */
  batchOuterRejected?: boolean;
}

/**
 * Raw MongoDB document — collection `tx_logs` (DB `megawin-tenant`).
 *
 * **1 document = 1 transaction.** Search theo `tx` trả đúng 1 record.
 * Batch N items → N docs nhóm qua `batchId`.
 *
 * Payload raw JSON (`Record<string, unknown>`) — generic mọi game/product.
 * Chỉ log sau khi nhận response / exception → 1 DB call / transaction.
 *
 * ## Trạng thái document
 *
 * - **Success** (`status = success`): có `requestPayload` + `responsePayload`.
 *   KHÔNG có `error`. `responsePayload` đã chứa đủ thông tin (balance, duplicate, ...).
 * - **Failed business** (`status = failed`): có `requestPayload` + `responsePayload`
 *   + `error` (code/message từ tenant).
 * - **Failed outer batch**: có `requestPayload` + `responsePayload` (outer envelope)
 *   + `error` với `batchOuterRejected: true`.
 * - **Failed HTTP**: có `requestPayload` + optional `responsePayload` (body parse được)
 *   + `error` với `httpStatus`.
 * - **Failed timeout / network**: có `requestPayload` + `error` (code = TIMEOUT/...)
 *   KHÔNG có `responsePayload`.
 *
 * ## Indexes (xem §7)
 */
export interface TxLogDoc {
  _id: unknown;

  // ── Event identity ────────────────────────────────────────────
  eventType: TxLogEventType;

  /**
   * Idempotency key của transaction — UUIDv7.
   * - Single: = `request.tx`.
   * - Batch item: = `item.tx`.
   *
   * Unique index.
   */
  tx: string;

  /**
   * Group key per HTTP call.
   * - Single: = `tx`.
   * - Batch: UUIDv7 mới, share bởi N items cùng batch.
   */
  batchId: string;

  // ── Routing ───────────────────────────────────────────────────
  tenantId: string;

  // ── Request / Response — raw evidence ─────────────────────────
  /**
   * Payload gửi đi — per-item.
   * - Single: `TransactionRequest`.
   * - Batch item: `BatchTransactionItem` (phần item này, không phải cả batch).
   */
  requestPayload: Record<string, unknown>;

  /**
   * Response từ tenant — per-item.
   * - Single: full `TransactionResponse`.
   * - Batch item: `BatchTransactionItemResult`.
   * - Batch outer reject: full `BatchTransactionResponse` (outer error + empty data).
   * - Timeout / network error: `undefined`.
   * - HTTP error với body non-JSON: `{ __raw: string, __parseError: true }`.
   */
  responsePayload?: Record<string, unknown>;

  // ── Result ─────────────────────────────────────────────────────
  /** `success` hoặc `failed`. */
  status: TxLogStatus;

  /**
   * Error details — CHỈ có khi `status = failed`.
   * Tập trung mọi thông tin debug (code, message, httpStatus, batchOuterRejected).
   */
  error?: TxLogError;

  // ── Timestamps ─────────────────────────────────────────────────
  /**
   * Thời điểm log được ghi (~ thời điểm nhận response / exception).
   *
   * **Đồng thời là TTL anchor** — TTL index `{ createdAt: 1 }` với
   * `expireAfterSeconds = 90 * 86_400`. KHÔNG cần field `expiresAt` riêng.
   */
  createdAt: Date;
}

/** Entity sau khi qua mapper. */
export interface TxLogEntity extends Omit<TxLogDoc, "_id"> {
  id: string;
}

/** Input cho insert. */
export type TxLogInput = Omit<TxLogDoc, "_id">;
```

### 4.3 Tổng kết — chỉ còn 9 field top-level

| Field | Kiểu | Bắt buộc | Ý nghĩa |
|-------|------|----------|---------|
| `_id` | ObjectId | ✓ | Mongo auto. |
| `eventType` | `TxLogEventType` | ✓ | single / batch. |
| `tx` | string (UUIDv7) | ✓ unique | Idempotency key. |
| `batchId` | string | ✓ | Group per HTTP call. |
| `tenantId` | string | ✓ | Partition. |
| `requestPayload` | JSON | ✓ | Raw request. |
| `responsePayload` | JSON \| undefined | — | Raw response (undefined khi throw). |
| `status` | `"success" \| "failed"` | ✓ | Filter chính. |
| `error` | `TxLogError` \| undefined | — | Chỉ khi failed. |
| `createdAt` | Date | ✓ | Sort + **TTL anchor**. |

So với bản đầu: bỏ `batchOuter` + `httpStatus` top-level (gộp vào `error`) + bỏ `expiresAt` (TTL dùng trực tiếp `createdAt` với `expireAfterSeconds = 90 * 86_400`).

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
   * List logs cho UI — cursor paginate, sort newest-first.
   *
   * Dùng cho cả 2 use case: filter tổng quát và list-by-batchId.
   * Khi `filter.batchId` có giá trị → tương đương "list tất cả items trong batch"
   * với cùng cơ chế phân trang.
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

  // List default sort khi không filter + TTL anchor.
  // TTL expireAfterSeconds = 90 ngày — MongoDB so sánh `createdAt + 90d` với now.
  {
    key: { createdAt: -1 },
    name: "createdAt_ttl",
    expireAfterSeconds: 90 * 86_400,
  },

  // Filter theo tenant.
  { key: { tenantId: 1, createdAt: -1 }, name: "tenantId_createdAt" },

  // UI "chỉ xem failed".
  { key: { status: 1, createdAt: -1 }, name: "status_createdAt" },
];
```

---

## 8. Classifier + Logger — Fire-and-Forget

### 8.1 Classifier

```ts
// packages/tenant-gateway/src/shared/tx-log-classifier.ts

import { ApiClientError } from "@megawin/http-client";
import type { TxLogError } from "../entities/tx-log";
import { TxLogStatus } from "../entities/enums";

/**
 * Kết quả phân loại 1 outcome — gồm `status` và optional `error`.
 *
 * - `status = success` → KHÔNG có `error`.
 * - `status = failed` → có `error` với đầy đủ code/message (+ optional httpStatus,
 *   batchOuterRejected).
 */
export interface ClassifiedOutcome {
  status: TxLogStatus;
  error?: TxLogError;
}

/**
 * Classify 1 item result (single transaction hoặc batch item).
 *
 * - `success = true` → Success (bao gồm `duplicate = true`).
 * - `success = false` → Failed + error từ response.
 */
export function classifyItem(item: {
  success: boolean;
  error?: { code: string; message: string };
}): ClassifiedOutcome {
  if (item.success) return { status: TxLogStatus.Success };
  return {
    status: TxLogStatus.Failed,
    error: {
      code: item.error?.code ?? "UNKNOWN",
      message: item.error?.message ?? "",
    },
  };
}

/**
 * Classify outer batch reject (`BatchTransactionResponse.success = false`).
 *
 * Thêm `batchOuterRejected: true` để UI phân biệt với item-level business fail.
 */
export function classifyBatchOuterReject(outerError?: {
  code: string;
  message: string;
}): ClassifiedOutcome {
  return {
    status: TxLogStatus.Failed,
    error: {
      code: outerError?.code ?? "BATCH_REJECTED",
      message: outerError?.message ?? "",
      batchOuterRejected: true,
    },
  };
}

/**
 * Classify exception throw từ HttpClient.
 *
 * Ordering:
 * 1. `ApiClientError` có `httpStatus` → Failed + `HTTP_<status>` + parse body.
 * 2. Name/message match timeout/aborted → Failed + `TIMEOUT`.
 * 3. Default → Failed + `err.code` hoặc `NETWORK_ERROR`.
 *
 * Return kèm `responsePayload` (nếu parse được body của HTTP error) để caller
 * ghi vào doc.
 */
export function classifyThrown(err: unknown): {
  outcome: ClassifiedOutcome;
  responsePayload?: Record<string, unknown>;
} {
  const anyErr = err as any;
  const message = typeof anyErr?.message === "string" ? anyErr.message : String(err);

  if (err instanceof ApiClientError && typeof anyErr.httpStatus === "number") {
    const status = anyErr.httpStatus as number;
    return {
      outcome: {
        status: TxLogStatus.Failed,
        error: {
          code: `HTTP_${status}`,
          message,
          httpStatus: status,
        },
      },
      responsePayload: tryParseRawBody(anyErr.responseBody),
    };
  }

  const name = typeof anyErr?.name === "string" ? anyErr.name : "";
  if (/timeout|aborterror|aborted/i.test(name) || /timeout|aborted/i.test(message)) {
    return {
      outcome: {
        status: TxLogStatus.Failed,
        error: { code: "TIMEOUT", message },
      },
    };
  }

  const code = typeof anyErr?.code === "string" ? anyErr.code : "NETWORK_ERROR";
  return {
    outcome: {
      status: TxLogStatus.Failed,
      error: { code, message },
    },
  };
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

const repo = new TxLogRepository();

/**
 * Fire-and-forget log 1 doc. Tự stamp `createdAt` = now.
 *
 * TTL do MongoDB quản lý qua index trên `createdAt` (xem {@link TX_LOG_INDEXES}).
 * Không cần field `expiresAt` — `expireAfterSeconds` làm việc đó.
 */
export async function logTx(input: Omit<TxLogInput, "createdAt">): Promise<void> {
  await repo.insertLog({ ...input, createdAt: new Date() });
}

/**
 * Fire-and-forget bulk log N docs (batch). Stamp cùng 1 `createdAt` cho cả batch.
 */
export async function logTxBulk(
  inputs: Array<Omit<TxLogInput, "createdAt">>,
): Promise<void> {
  if (inputs.length === 0) return;
  const createdAt = new Date();
  const docs: TxLogInput[] = inputs.map((i) => ({ ...i, createdAt }));
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
- Outer batch reject (`success: false` ở outer) → N docs failed với `error.batchOuterRejected = true`, `responsePayload = undefined`.
- Transport error (timeout/network/HTTP) → N docs failed, dùng `classifyThrown`.

### 9.2 Pseudo-code

```ts
// packages/tenant-gateway/src/transaction/transaction-api.ts

import { randomUUID } from "node:crypto";
import { logTx, logTxBulk } from "../shared/tx-logger";
import {
  classifyItem,
  classifyBatchOuterReject,
  classifyThrown,
} from "../shared/tx-log-classifier";
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
          ...outcome,
        });
        return response;
      } catch (err) {
        const { outcome, responsePayload } = classifyThrown(err);
        void logTx({
          eventType: TxLogEventType.Transaction,
          tx: req.tx,
          batchId: req.tx,
          tenantId,
          requestPayload: req as any,
          responsePayload,
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

        // Outer batch reject → N docs failed với batchOuterRejected=true.
        if (!response.success) {
          const outcome = classifyBatchOuterReject(response.error);
          const docs = req.items.map((item) => ({
            eventType: TxLogEventType.BatchTransaction,
            tx: item.tx,
            batchId,
            tenantId,
            requestPayload: item as any,
            // Lưu nguyên outer response — debug context đầy đủ.
            responsePayload: response as any,
            ...outcome,
          }));
          void logTxBulk(docs);
          return response;
        }

        // Outer success → N docs, classify từng item theo result.
        const resultMap = new Map(
          (response.data?.results ?? []).map((r) => [r.tx, r]),
        );
        const docs = req.items.map((item) => {
          const result = resultMap.get(item.tx);
          const outcome = result
            ? classifyItem({ success: result.success, error: result.error })
            : {
                status: TxLogStatus.Failed,
                error: {
                  code: "MISSING_RESULT",
                  message: "Tenant response thiếu result cho tx này",
                },
              };
          return {
            eventType: TxLogEventType.BatchTransaction,
            tx: item.tx,
            batchId,
            tenantId,
            requestPayload: item as any,
            responsePayload: result as any,
            ...outcome,
          };
        });
        void logTxBulk(docs);
        return response;
      } catch (err) {
        // Transport/HTTP error → N docs failed cùng error object.
        const { outcome, responsePayload } = classifyThrown(err);
        const docs = req.items.map((item) => ({
          eventType: TxLogEventType.BatchTransaction,
          tx: item.tx,
          batchId,
          tenantId,
          requestPayload: item as any,
          responsePayload,
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
    ├── list-tx-logs-by-batch.ts
    └── get-tx-log-by-tx.ts
```

### 10.2 Types

Dùng lại `Pagination` từ `@megawin/shared/constants/pagination` và `ApiResponseMeta` style cho output → **KHÔNG tự viết lại cấu trúc pagination**.

```ts
// packages/tenant-gateway/src/use-cases/tx-logs/types.ts

import type { TxLogEntity } from "../../entities";
import type { TxLogStatus, TxLogEventType } from "../../entities/enums";

/** Cursor reusable cho cả list + list-by-batch. */
export interface TxLogCursor {
  createdAt: string;
  id: string;
}

export interface ListTxLogsInput {
  /** Exact tx. Khi có → bỏ qua `from/to`. */
  tx?: string;
  from?: string;
  to?: string;
  status?: TxLogStatus;
  tenantId?: string;
  eventType?: TxLogEventType;
  batchId?: string;
  cursor?: TxLogCursor | null;
  /** Default = `Pagination.Default.Size` (20). Max = `Pagination.Max.Size` (100). */
  limit?: number;
}

export interface ListTxLogsOutput {
  data: TxLogEntity[];
  nextCursor: TxLogCursor | null;
}

/** Input cho `GetTxLogByTxUseCase` — chỉ cần `tx`. */
export interface GetTxLogByTxInput {
  tx: string;
}

/** Output — chỉ trả đúng record của tx, không kèm siblings. */
export interface GetTxLogByTxOutput {
  log: TxLogEntity | null;
}

/** Input cho `ListTxLogsByBatchUseCase` — list tất cả items cùng batch, có paging. */
export interface ListTxLogsByBatchInput {
  batchId: string;
  cursor?: TxLogCursor | null;
  limit?: number;
}

export type ListTxLogsByBatchOutput = ListTxLogsOutput;
```

### 10.3 `ListTxLogsUseCase`

```ts
// packages/tenant-gateway/src/use-cases/tx-logs/list-tx-logs.ts

import { Pagination } from "@megawin/shared/constants/pagination";
import { NextApiUseCase } from "@megawin/next/server";
import { TxLogRepository } from "../../infras/repos";
import type { ListTxLogsInput, ListTxLogsOutput } from "./types";

const MAX_RANGE_DAYS = 31;
const RETENTION_DAYS = 90;

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
    const limit = Math.min(
      input.limit ?? Pagination.Default.Size,
      Pagination.Max.Size,
    );
    const cursor = input.cursor
      ? { createdAt: new Date(input.cursor.createdAt), id: input.cursor.id }
      : null;

    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;

    if (!input.tx && from && to) this.validateRange(from, to);

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
    const retentionFloor = Date.now() - RETENTION_DAYS * 86_400_000;
    if (from.getTime() < retentionFloor) {
      throw new Error(`BAD_RANGE: from ngoài retention ${RETENTION_DAYS} ngày`);
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
 * Tra cứu log của 1 `tx` — chỉ trả đúng 1 record (hoặc null khi không tồn tại
 * / đã bị TTL).
 *
 * **Không** tự load siblings. UI muốn xem các items cùng batch → click vào
 * `batchId` để gọi `ListTxLogsByBatchUseCase` (có phân trang).
 */
export class GetTxLogByTxUseCase extends NextApiUseCase<GetTxLogByTxInput, GetTxLogByTxOutput> {
  private readonly repo = new TxLogRepository();

  protected async execute(input: GetTxLogByTxInput): Promise<GetTxLogByTxOutput> {
    const log = await this.repo.findByTx(input.tx);
    return { log };
  }
}
```

### 10.5 `ListTxLogsByBatchUseCase`

```ts
// packages/tenant-gateway/src/use-cases/tx-logs/list-tx-logs-by-batch.ts

import { Pagination } from "@megawin/shared/constants/pagination";
import { NextApiUseCase } from "@megawin/next/server";
import { TxLogRepository } from "../../infras/repos";
import type { ListTxLogsByBatchInput, ListTxLogsByBatchOutput } from "./types";

/**
 * List tất cả items thuộc cùng 1 `batchId`, có phân trang (cursor).
 *
 * Dùng khi user click vào `batchId` ở UI để xem full context của batch.
 * Sort newest-first — nhất quán với `ListTxLogsUseCase`.
 */
export class ListTxLogsByBatchUseCase extends NextApiUseCase<
  ListTxLogsByBatchInput,
  ListTxLogsByBatchOutput
> {
  private readonly repo = new TxLogRepository();

  protected async execute(
    input: ListTxLogsByBatchInput,
  ): Promise<ListTxLogsByBatchOutput> {
    const limit = Math.min(
      input.limit ?? Pagination.Default.Size,
      Pagination.Max.Size,
    );
    const cursor = input.cursor
      ? { createdAt: new Date(input.cursor.createdAt), id: input.cursor.id }
      : null;

    return await this.repo.listLogs(
      { batchId: input.batchId },
      { limit, cursor },
    );
  }
}
```

### 10.6 Barrels

```ts
// packages/tenant-gateway/src/use-cases/tx-logs/index.ts
export * from "./types";
export * from "./list-tx-logs";
export * from "./list-tx-logs-by-batch";
export * from "./get-tx-log-by-tx";
```

### 10.7 Subpath export — `package.json`

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
apps/backoffice/src/app/api/tenant-tx-logs/
├── route.ts                   ← GET list + filter
├── [tx]/route.ts              ← GET detail (log only)
└── batches/[batchId]/route.ts ← GET list items trong batch (có paging)
```

### 11.1 List route

```ts
// apps/backoffice/src/app/api/tenant-tx-logs/route.ts

import { z } from "zod";
import { withApi } from "@megawin/next/server";
import { CompanyRole } from "@megawin/shared/roles";
import { Pagination } from "@megawin/shared/constants/pagination";
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
  limit: z.coerce.number().int().min(1).max(Pagination.Max.Size).optional(),
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
// apps/backoffice/src/app/api/tenant-tx-logs/[tx]/route.ts

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

### 11.3 List-by-batch route

```ts
// apps/backoffice/src/app/api/tenant-tx-logs/batches/[batchId]/route.ts

import { z } from "zod";
import { withApi } from "@megawin/next/server";
import { CompanyRole } from "@megawin/shared/roles";
import { Pagination } from "@megawin/shared/constants/pagination";
import { ListTxLogsByBatchUseCase } from "@megawin/tenant-gateway/use-cases/tx-logs";

const paramsSchema = z.object({ batchId: z.string().trim().min(1) });
const querySchema = z.object({
  cursorCreatedAt: z.string().datetime().optional(),
  cursorId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(Pagination.Max.Size).optional(),
});

const useCase = new ListTxLogsByBatchUseCase();

export const GET = withApi({
  auth: { roles: [CompanyRole.Staff, CompanyRole.Admin] },
  paramsSchema,
  querySchema,
  handler: async ({ params, query }) =>
    await useCase.run({
      batchId: params.batchId,
      limit: query.limit,
      cursor:
        query.cursorCreatedAt && query.cursorId
          ? { createdAt: query.cursorCreatedAt, id: query.cursorId }
          : null,
    }),
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
  url: "/reports/tenant-tx-logs",
  icon: FileClock,
  roles: [CompanyRole.Staff],
},
```

### 12.2 Page structure

```
apps/backoffice/src/app/(main)/reports/tenant-tx-logs/
├── page.tsx                       ← Suspense wrapper
├── batches/[batchId]/page.tsx     ← Page list items trong 1 batch
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
/reports/tenant-tx-logs
  ?tx=<uuid>                      // mode 1
  // OR
  ?from=2026-04-01&to=2026-04-29&status=failed   // mode 2
  ?detail=<tx>                    // open drawer

/reports/tenant-tx-logs/batches/<batchId>   // page list items trong batch
```

### 12.5 Table columns

Dùng `displayVNDateTime` từ `@megawin/shared/utils/date`. Theo rule `frontend-dev.mdc` §1.7 / §1.7a:

| Cột | Width | Content | Class |
|-----|-------|---------|-------|
| Thời gian | 170px | `displayVNDateTime(createdAt)` | `pl-5 text-xs font-mono tabular-nums` |
| Status | 110px | Badge `success` (green) / `failed` (red) | `text-xs` |
| Event | 90px | `Single` / `Batch` | `text-xs` |
| Tenant | 120px | `tenantId` | `text-xs` |
| Tx | 280px | `tx` monospace + copy icon | `text-xs font-mono` |
| BatchId | 120px | `batchId` short (8 chars) → **Link** đến `/reports/tenant-tx-logs/batches/<batchId>` khi `eventType = batch` | `text-xs font-mono text-muted-foreground` |
| Error | 280px | `error.code` + truncate `error.message` (hoặc `—` khi success) | `pr-5 text-xs text-muted-foreground` |

Click row (trừ cột BatchId) → drawer. Click vào BatchId → navigate sang page list-by-batch.

### 12.6 Drawer content

- **Header**: badge status + eventType + tenant + `displayVNDateTime(createdAt)`.
- **Identity**: `tx` (copy) · `batchId` (copy + **Link** đến page list-by-batch nếu là batch event).
- **Error box** (khi failed): `error.code` + `error.message` + optional `error.httpStatus` chip + `Batch bị reject toàn bộ` chip khi `error.batchOuterRejected = true`.
- **Request section**: pretty-printed JSON `requestPayload` (copy button).
- **Response section**: pretty-printed JSON `responsePayload` (copy button) — hoặc empty state "Không có response (timeout/network error)".

Drawer **KHÔNG** embed siblings table. Siblings hiển thị ở page riêng `/reports/tenant-tx-logs/batches/<batchId>` — có đủ filter, paging, scroll.

### 12.7 List-by-batch page

Page `/reports/tenant-tx-logs/batches/<batchId>`:
- Breadcrumb: `Nhật ký giao dịch / Batch <short>`
- Header card: `batchId` full, `tenantId`, `eventType = batch_transaction`, số items total (derive từ response), `createdAt` của item đầu tiên.
- Table: dùng lại `tx-log-table.tsx` với data = `ListTxLogsByBatchOutput.data`, infinite scroll theo `nextCursor`.
- Click row → drawer chi tiết `tx` (tái dùng logic drawer).

### 12.8 Labels — đặt trong `tenant-gateway/src/shared/labels/`

Label là domain knowledge của `tx-log` → để ở package `tenant-gateway` để FE/BE chung 1 nguồn. **Không** đặt riêng ở FE.

```ts
// packages/tenant-gateway/src/shared/labels/tx-log-labels.ts

import { TxLogStatus, TxLogEventType } from "../../entities/enums";

/** Label hiển thị status. */
export const TX_LOG_STATUS_LABELS: Record<TxLogStatus, string> = {
  success: "Thành công",
  failed: "Thất bại",
};

/** Variant badge theo status. */
export const TX_LOG_STATUS_VARIANT: Record<
  TxLogStatus,
  "default" | "destructive"
> = {
  success: "default",
  failed: "destructive",
};

/** Label hiển thị eventType. */
export const TX_LOG_EVENT_TYPE_LABELS: Record<TxLogEventType, string> = {
  transaction: "Single",
  batch_transaction: "Batch",
};
```

```ts
// packages/tenant-gateway/src/shared/labels/index.ts
export * from "./tx-log-labels";
```

```ts
// packages/tenant-gateway/src/index.ts — re-export
export * from "./shared/labels";
```

---

## 13. React Query hooks

```ts
// _lib/use-queries.ts

export const txLogKeys = {
  all: ["tx-logs"] as const,
  list: (filters: object) => [...txLogKeys.all, "list", filters] as const,
  byTx: (tx: string) => [...txLogKeys.all, "tx", tx] as const,
  byBatch: (batchId: string) => [...txLogKeys.all, "batch", batchId] as const,
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
      const res = await fetch(`/api/tenant-tx-logs?${params}`);
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
      const res = await fetch(`/api/tenant-tx-logs/${tx}`);
      if (!res.ok) throw new Error("detail failed");
      return res.json();
    },
  });
}

/** List tất cả items trong 1 batch — dùng ở page `/batches/<batchId>`. */
export function useTxLogsByBatch(batchId: string | null) {
  return useInfiniteQuery({
    queryKey: batchId ? txLogKeys.byBatch(batchId) : txLogKeys.all,
    enabled: !!batchId,
    initialPageParam: null as { createdAt: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) {
        params.set("cursorCreatedAt", pageParam.createdAt);
        params.set("cursorId", pageParam.id);
      }
      const res = await fetch(
        `/api/tenant-tx-logs/batches/${batchId}?${params}`,
      );
      if (!res.ok) throw new Error("list-by-batch failed");
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 10_000,
  });
}
```

---

## 14. Retention & Security

### 14.1 Retention

- TTL index đặt trực tiếp trên `createdAt` với `expireAfterSeconds = 90 * 86_400`.
- Logger **không** tự stamp `expiresAt` — MongoDB tự quản.
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

1. **Migration**: apply `TX_LOG_INDEXES` vào `megawin-tenant.tx_logs` (TTL chạy trên `createdAt`).
2. **Deploy `tenant-gateway`**: logger + classifier + wrap + use-cases + labels. Log bắt đầu ghi ngay.
3. **Deploy BE routes**: `/api/tenant-tx-logs`, `/api/tenant-tx-logs/[tx]`, `/api/tenant-tx-logs/batches/[batchId]`.
4. **Deploy FE**: page list + page by-batch + sidebar.
5. **Smoke**: 1 single transaction + 1 batch → confirm log doc xuất hiện với đúng `tx`, `batchId`, `status`; click batchId → đúng N items.

---

## 16. Checklist implementation

- [ ] **Step 1** `packages/tenant-gateway/src/entities/enums.ts` — `TxLogStatus` (success|failed), `TxLogEventType`
- [ ] **Step 2** `packages/tenant-gateway/src/entities/tx-log.ts` — `TxLogDoc` / `TxLogEntity` / `TxLogInput` (9 field top-level, KHÔNG có `expiresAt`)
- [ ] **Step 3** `packages/tenant-gateway/src/entities/index.ts` — barrel
- [ ] **Step 4** `packages/tenant-gateway/src/infras/base-repo.ts` — `TenantGatewayBaseRepo`
- [ ] **Step 5** `packages/tenant-gateway/src/infras/mappers/tx-log-mapper.ts` + barrel
- [ ] **Step 6** `packages/tenant-gateway/src/infras/repos/types/tx-log.types.ts` + barrel
- [ ] **Step 7** `packages/tenant-gateway/src/infras/repos/tx-log-repo.ts` — `insertLog/insertLogs/findByTx/listLogs`
- [ ] **Step 8** `packages/tenant-gateway/src/infras/repos/index.ts` — re-export
- [ ] **Step 9** `packages/tenant-gateway/src/infras/indexes/tx-log-indexes.ts` — TX_LOG_INDEXES (TTL trên `createdAt`)
- [ ] **Step 10** `packages/tenant-gateway/src/shared/tx-log-classifier.ts` — 3 classify function
- [ ] **Step 11** `packages/tenant-gateway/src/shared/tx-logger.ts` — `logTx` + `logTxBulk` (chỉ stamp `createdAt`)
- [ ] **Step 12** `packages/tenant-gateway/src/shared/labels/tx-log-labels.ts` + barrel
- [ ] **Step 13** `packages/tenant-gateway/src/transaction/transaction-api.ts` — wrap single + batch
- [ ] **Step 14** `packages/tenant-gateway/src/client.ts` — pass `config.tenantId` to factory
- [ ] **Step 15** `packages/tenant-gateway/src/use-cases/tx-logs/` — types + `ListTxLogsUseCase` + `GetTxLogByTxUseCase` (không siblings) + `ListTxLogsByBatchUseCase` + barrel
- [ ] **Step 16** `packages/tenant-gateway/package.json` — subpath export `./use-cases/tx-logs`
- [ ] **Step 17** `packages/tenant-gateway/src/index.ts` — re-export entities + labels
- [ ] **Step 18** Migration script apply `TX_LOG_INDEXES` vào `megawin-tenant.tx_logs`
- [ ] **Step 19** `apps/backoffice/src/app/api/tenant-tx-logs/route.ts`
- [ ] **Step 20** `apps/backoffice/src/app/api/tenant-tx-logs/[tx]/route.ts`
- [ ] **Step 21** `apps/backoffice/src/app/api/tenant-tx-logs/batches/[batchId]/route.ts`
- [ ] **Step 22** `apps/backoffice/src/navigation/sidebar/sidebar-items.ts` — add menu item `/reports/tenant-tx-logs`
- [ ] **Step 23** FE page `(main)/reports/tenant-tx-logs/page.tsx` + filter bar + table + drawer + hooks
- [ ] **Step 24** FE page `(main)/reports/tenant-tx-logs/batches/[batchId]/page.tsx` (reuse table + drawer)
- [ ] **Step 25** Smoke test — single + batch (partial fail) + timeout → verify `tx`, `batchId`, `status`, `responsePayload` + click batch navigate đúng

---

## 17. Acceptance criteria

- [x] 2 events `transaction` + `batch_transaction` log đầy đủ. `check_status` + `balance` KHÔNG log.
- [x] 1 transaction = 1 doc. Batch N items = N docs cùng `batchId`. Tra cứu theo `tx` luôn trả đúng 1 record.
- [x] Status chỉ `success` / `failed`. Chi tiết lỗi gom trong object `error` (code, message, httpStatus?, batchOuterRejected?). Khi success → KHÔNG có field `error`.
- [x] `requestPayload` / `responsePayload` raw JSON — generic cho mọi game. Payload tiến hoá (thêm `batchKey` tenant response) không cần sửa schema.
- [x] Chỉ 1 DB call / transaction (log sau response, không log pre-request).
- [x] Collection tên `tx_logs` trong DB `megawin-tenant`.
- [x] TTL 90 ngày chạy trực tiếp trên `createdAt` — KHÔNG có field `expiresAt`.
- [x] Logger fail KHÔNG block dispatch / place-bet.
- [x] UI filter:
  - Mode "by tx": exact match, disable range/status.
  - Mode "by range": date picker + status selector (tất cả / success / failed). Range ≤ 31 ngày, ≤ 90 ngày retention.
- [x] Click row → drawer chỉ có request/response/error của `tx` đó (KHÔNG embed siblings).
- [x] Click `batchId` → navigate sang page `/reports/tenant-tx-logs/batches/<batchId>` với phân trang riêng.
- [x] Role `CompanyRole.Staff+` mới truy cập.
- [x] Schema 9 field top-level. Labels ở `packages/tenant-gateway/src/shared/labels/`.
- [x] Pagination dùng `Pagination` const của `@megawin/shared`. Date format dùng `displayVNDateTime` của `@megawin/shared/utils/date`. KHÔNG tự viết lại.







