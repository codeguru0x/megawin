/**
 * Repository cho collection `tx_logs` (DB `megawin-tenant`).
 *
 * ## Contract
 *
 * - `upsertLog` / `upsertLogs` **fire-and-forget**: swallow mọi lỗi và
 *   `console.error` — KHÔNG throw ra caller để log fail không block
 *   dispatch / place-bet flow.
 * - `findByTx` / `listLogs`: phục vụ Backoffice, throw bình thường.
 *
 * ## Ngữ nghĩa "1 doc / tx = attempt cuối cùng"
 *
 * Retry nhiều lần cùng `tx` → **KHÔNG append N docs**, mà **overwrite** doc
 * hiện có. Staff chỉ cần biết kết quả mới nhất (success hay lỗi gì). Lịch sử
 * các lần fail trước được ghi ở `tenant_dispatch_orders.lastError` + metrics.
 *
 * Write implement qua **`replaceOne + upsert`** (gọi qua `bulkWrite`) để true
 * overwrite — field optional cũ (`error`, `responsePayload`) bị xoá khi
 * attempt sau không còn. Không dùng `$set` vì MongoDB driver strip `undefined`
 * → field cũ bị giữ lại → misleading state.
 *
 * Unique index `tx_unique` vẫn đảm bảo không sinh doc trùng ngay cả khi 2
 * invocation concurrent cùng `tx` (cold-start overlap).
 */

import { type Document, type Filter, type Sort, ObjectId } from "mongodb";

import { TenantGatewayBaseRepo } from "../base-repo";
import { TxLogMapper } from "../mappers";
import type { TxLogDoc, TxLogEntity } from "../../entities";
import type {
  AggregateTxLogsSummaryFilter,
  AggregateTxLogsSummaryResult,
  ListTxLogsFilter,
  ListTxLogsOptions,
  ListTxLogsResult,
  TxLogInsertDoc,
} from "./types";

export class TxLogRepository extends TenantGatewayBaseRepo<TxLogEntity, TxLogMapper> {
  constructor() {
    super({ collName: "tx_logs", dataMapper: new TxLogMapper() });
  }

  /**
   * Fire-and-forget upsert 1 doc (single transaction).
   *
   * Filter theo `tx` — tồn tại thì overwrite, chưa có thì insert. `createdAt`
   * luôn được cập nhật = thời điểm attempt hiện tại → TTL 90 ngày đếm từ lần
   * log cuối cùng (giữ record sống lâu hơn khi có retry).
   *
   * Dùng `replaceOne` thay vì `$set` vì cần **true overwrite**: khi attempt
   * trước fail (có `error`), attempt sau success (không có `error`) → doc mới
   * phải KHÔNG còn `error` cũ. `$set` bị MongoDB driver strip `undefined` →
   * field cũ sót lại → misleading.
   *
   * `_id` được giữ nguyên khi match. Mọi lỗi được catch + log.
   */
  async upsertLog(input: TxLogInsertDoc): Promise<void> {
    try {
      await this.replaceOne({ tx: input.tx }, input, { upsert: true });
    } catch (err) {
      console.error("[tx-log] upsert failed:", err);
    }
  }

  /**
   * Fire-and-forget bulk upsert (batch N items = N docs, mỗi item 1 doc).
   *
   * Dùng `bulkWrite` với N `replaceOne` ops — filter theo `tx` của từng item.
   * `replaceOne` true-overwrite → clear field cũ (khác với `$set` bị driver
   * strip `undefined`). `ordered: false` để 1 item lỗi không block items còn lại.
   */
  async upsertLogs(inputs: TxLogInsertDoc[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }

    try {
      await this.bulkWrite(
        inputs.map((input) => ({
          replaceOne: {
            filter: { tx: input.tx },
            replacement: input,
            upsert: true,
          },
        })),
        { ordered: false },
      );
    } catch (err) {
      console.error("[tx-log] bulk upsert failed:", err);
    }
  }

  /** Lookup exact theo `tx` — unique, trả 0 hoặc 1 record (attempt cuối cùng). */
  async findByTx(tx: string): Promise<TxLogEntity | null> {
    return await this.findOne({ tx });
  }

  /**
   * List logs cho UI — cursor paginate.
   *
   * Dùng chung cho cả:
   * - Filter tổng quát (`tx`, range, status, tenantId, eventType): sort
   *   newest-first theo `createdAt DESC, _id DESC`.
   * - List-by-batch (`batchId` only): sort theo `tx ASC` — `tx` là UUIDv7
   *   time-ordered (48-bit ms timestamp + monotonic counter) nên tương
   *   đương thứ tự thời gian tạo order, đủ deterministic cho mục đích
   *   hiển thị mà không cần field `batchIndex` riêng.
   *
   * Trả `data` + `nextCursor` (null khi hết page). Cursor là `{ createdAt, id }`
   * cho default sort, hoặc `{ tx }` cho batch-scoped.
   */
  async listLogs(filter: ListTxLogsFilter, options: ListTxLogsOptions): Promise<ListTxLogsResult> {
    const mongoFilter = this.buildFilter(filter, options.cursor);
    const isBatchScoped = !!filter.batchId && !filter.tx;
    const sort: Sort = isBatchScoped ? { tx: 1 } : { createdAt: -1, _id: -1 };
    const limit = options.limit;

    const data = await this.findMany(mongoFilter as Filter<Document>, { sort, limit: limit + 1 });
    const hasMore = data.length > limit;
    const sliced = hasMore ? data.slice(0, limit) : data;
    const last = sliced[sliced.length - 1];
    // Cursor shape adaptive theo sort:
    // - Default (time-desc): id = entity `_id`, dùng cùng `createdAt` để sort
    //   ổn định khi nhiều docs trùng `createdAt`.
    // - Batch-scoped (tx-asc): id = `tx` (UUIDv7), dùng làm `$gt` trực tiếp
    //   để match sort key. `createdAt` trong cursor vẫn set cho shape đồng
    //   nhất nhưng không dùng để query.
    const nextCursor =
      hasMore && last
        ? {
            createdAt: last.createdAt.toISOString(),
            id: isBatchScoped ? last.tx : last.id,
          }
        : null;

    return { data: sliced, nextCursor };
  }

  /**
   * Aggregate KPI cho trang "Nhật ký giao dịch" — tất cả số đếm trong 1 DB call.
   *
   * Dùng `$facet` chạy 2 pipeline song song:
   * - `counts`: group `status` → success / failed count.
   * - `uncertain`: match docs có `error.code` thuộc nhóm uncertainty
   *   (TIMEOUT / NETWORK_ERROR / HTTP_5xx / BATCH_REJECTED).
   *
   * Sort không cần — summary là aggregate không phân trang. Index
   * `{ createdAt: -1 }` đủ phục vụ `$match` range.
   */
  async aggregateSummary(filter: AggregateTxLogsSummaryFilter): Promise<AggregateTxLogsSummaryResult> {
    const matchStage = {
      createdAt: {
        $gte: filter.from,
        $lte: filter.to,
      },
    };

    const pipeline: Document[] = [
      { $match: matchStage },
      {
        $facet: {
          counts: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ],
          uncertain: [
            {
              $match: {
                status: "failed",
                $or: [
                  { "error.code": "TIMEOUT" },
                  { "error.code": "NETWORK_ERROR" },
                  // HTTP 5xx: HTTP_500, HTTP_502, HTTP_503, HTTP_504...
                  { "error.code": { $regex: /^HTTP_5\d{2}$/ } },
                  { "error.batchOuterRejected": true },
                ],
              },
            },
            { $count: "count" },
          ],
        },
      },
    ];

    const [result] = await this.aggregate(pipeline);

    const counts = (result?.counts ?? []) as Array<{ _id: string; count: number }>;
    const uncertain = (result?.uncertain ?? []) as Array<{ count: number }>;

    const successCount = counts.find((c) => c._id === "success")?.count ?? 0;
    const failedCount = counts.find((c) => c._id === "failed")?.count ?? 0;
    const uncertainCount = uncertain[0]?.count ?? 0;

    return {
      total: successCount + failedCount,
      successCount,
      failedCount,
      uncertainCount,
    };
  }

  private buildFilter(filter: ListTxLogsFilter, cursor: ListTxLogsOptions["cursor"]): Filter<TxLogDoc> {
    const conditions: Filter<TxLogDoc>[] = [];

    if (filter.tx) {
      conditions.push({ tx: filter.tx });
    } else if (filter.from || filter.to) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (filter.from) range.$gte = filter.from;
      if (filter.to) range.$lte = filter.to;
      conditions.push({ createdAt: range } as Filter<TxLogDoc>);
    }

    if (filter.status) conditions.push({ status: filter.status });
    if (filter.tenantId) conditions.push({ tenantId: filter.tenantId });
    if (filter.eventType) conditions.push({ eventType: filter.eventType });
    if (filter.batchId) conditions.push({ batchId: filter.batchId });

    if (cursor) {
      const isBatchScoped = !!filter.batchId && !filter.tx;
      if (isBatchScoped) {
        // Batch-scoped sort theo `tx ASC` (UUIDv7 time-ordered) → cursor
        // payload `id` là `tx` của doc cuối page trước. Dùng `$gt` để lấy
        // docs có `tx` lớn hơn (tức tạo sau).
        conditions.push({ tx: { $gt: cursor.id } } as Filter<TxLogDoc>);
      } else {
        conditions.push({
          $or: [
            { createdAt: { $lt: cursor.createdAt } },
            {
              createdAt: cursor.createdAt,
              _id: { $lt: new ObjectId(cursor.id) },
            },
          ],
        } as Filter<TxLogDoc>);
      }
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0]!;
    return { $and: conditions };
  }
}
