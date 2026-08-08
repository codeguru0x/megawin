import type { AnyBulkWriteOperation, Filter, Document } from "mongodb";
import { ObjectId } from "mongodb";
import { isOnlyDuplicateKeyError } from "@megawin/data/mongo";

import { TenantDispatchBaseRepo } from "./base-repo";
import { DispatchOrderMapper } from "../mappers/dispatch-order-mapper";
import { DispatchOrderStatus, DispatchSourceKind } from "../../entities/enums";
import type { TenantDispatchOrderEntity, TenantDispatchOrderInput } from "../../entities/dispatch-order";
import type { TransactionAction, TransactionReason, Currency } from "@megawin/shared/types";
import type {
  PendingDispatchOrder,
  BatchProgress,
  ListBySourceFilter,
  ListStuckFilter,
  ListDispatchOrdersFilter,
  ListDispatchOrdersResult,
  DispatchSummary,
  DispatchSummaryFilter,
  DispatchFacets,
  DispatchFacetsFilter,
} from "./types";
import { RETRY_ALERT_THRESHOLD } from "../../config";

/**
 * Repository cho collection `tenant_dispatch_orders` (DB `megawin-tenant`).
 *
 * Đóng kín mọi MongoDB operation cho outbox — use cases chỉ gọi method, không biết pipeline.
 *
 * ## Indexes (init ở deploy script / migration)
 * - `{ tx: 1 }` unique — enforce idempotency.
 * - `{ status: 1, nextAttemptAt: 1 }` partial `status = "pending"` — worker polling.
 * - `{ tenantId: 1, status: 1, nextAttemptAt: 1 }` — group + rate-limit per tenant.
 * - `{ batchKey: 1 }` — BO batch view.
 * - `{ gameId: 1, sourceKind: 1, sourceId: 1 }` — reverse lookup audit.
 * - `{ createdAt: 1 }` — TTL hoặc archive.
 *
 * ## Main vs Retry lane
 *
 * 2 worker tách biệt qua filter `retryCount`:
 * - **Main lane**: `{ retryCount: { $exists: false } }` — fresh orders chưa từng fail.
 * - **Retry lane**: `{ retryCount: { $exists: true } }` — orders đã fail ít nhất 1 lần.
 *
 * Lần fail đầu tiên chuyển order từ main sang retry lane (markAttemptFailed $inc retryCount).
 * Các lần fail sau chỉ tăng `retryCount`, order vẫn ở retry lane.
 */
export class DispatchOrderRepository extends TenantDispatchBaseRepo<TenantDispatchOrderEntity, DispatchOrderMapper> {
  constructor() {
    super({
      collName: "tenant_dispatch_orders",
      dataMapper: new DispatchOrderMapper(),
    });
  }

  /** Bulk insert orders với tolerance cho duplicate `tx`.
   *
   * Dùng `insertMany({ ordered: false })` — pattern chuẩn MongoDB cho
   * "insert-if-not-exists": những `tx` đã tồn tại raise duplicate key
   * nhưng các document khác vẫn được insert. Catch chỉ swallow nếu
   * TẤT CẢ errors là duplicate key (code 11000) — các lỗi khác throw.
   *
   * Nhanh hơn upsert `bulkWrite`: 1 bulk insert vs N index lookups + insert.
   *
   * IDEMPOTENT: gọi lại với cùng tx list → không tạo trùng.
   */
  async bulkEnqueue(orders: TenantDispatchOrderInput[]): Promise<void> {
    if (orders.length === 0) {
      return;
    }

    try {
      await this.insertMany(orders, { ordered: false });
    } catch (err) {
      if (!isOnlyDuplicateKeyError(err)) {
        throw err;
      }
    }
  }

  /**
   * Lấy batch orders **main lane** — fresh orders chưa từng fail.
   *
   * Filter: `status = "pending"` AND `nextAttemptAt <= now` AND `retryCount` missing.
   * Sort: `nextAttemptAt ASC` — FIFO.
   *
   * Index hint: `{ status: 1, nextAttemptAt: 1 }` partial.
   */
  async getPendingMainBatch(limit: number): Promise<PendingDispatchOrder[]> {
    return await this.queryPending({ retryCount: { $exists: false } }, limit);
  }

  /**
   * Lấy batch orders **retry lane** — orders đã fail ít nhất 1 lần.
   *
   * Filter: `status = "pending"` AND `nextAttemptAt <= now` AND `retryCount` exists.
   * Sort: `nextAttemptAt ASC` — FIFO theo thời điểm tới hạn retry.
   */
  async getPendingRetryBatch(limit: number): Promise<PendingDispatchOrder[]> {
    return await this.queryPending({ retryCount: { $exists: true } }, limit);
  }

  /**
   * Query pending orders
   * @param extraFilter - The extra filter to apply to the query
   * @param limit - The limit of the query
   * @returns The pending orders
   */
  private async queryPending(extraFilter: Record<string, unknown>, limit: number): Promise<PendingDispatchOrder[]> {
    const now = new Date();

    const docs = await this.findManyAsDocuments(
      {
        status: DispatchOrderStatus.Pending,
        nextAttemptAt: { $lte: now },
        ...extraFilter, // Extra filter to apply to the query
      },
      {
        sort: { nextAttemptAt: 1 }, // Sort by next attempt at ascending
        limit,
        projection: {
          _id: 1,
          tx: 1,
          tenantId: 1,
          accountId: 1,
          username: 1,
          action: 1,
          reason: 1,
          amount: 1,
          currency: 1,
          force: 1,
          gameId: 1,
          roundIds: 1,
          description: 1,
          metadata: 1,
          sourceKind: 1,
          sourceId: 1,
          batchKey: 1,
          retryCount: 1,
        },
      },
    );

    return docs.map(
      (d: any) =>
        ({
          id: d._id.toHexString(),
          tx: d.tx,
          tenantId: d.tenantId,
          accountId: d.accountId,
          username: d.username,
          action: d.action as TransactionAction,
          reason: d.reason as TransactionReason,
          amount: d.amount,
          currency: d.currency as Currency,
          force: d.force,
          gameId: d.gameId,
          roundIds: d.roundIds,
          description: d.description,
          metadata: d.metadata,
          sourceKind: d.sourceKind as DispatchSourceKind,
          sourceId: d.sourceId,
          batchKey: d.batchKey,
          retryCount: d.retryCount,
        }) as PendingDispatchOrder,
    );
  }

  /**
   * Bulk flush kết quả 1 batch — gộp cả `Dispatched` và `AttemptFailed` vào 1
   * MongoDB round trip.
   *
   * Giảm latency từ 2 RTT xuống 1 RTT bất kể phân bố success/fail. Noop-safe:
   * cả 2 list rỗng thì skip.
   *
   * Với order fresh (retryCount missing), `$inc retryCount: 1` ở nhánh fail sẽ
   * tạo field = 1 → order tự chuyển sang retry lane ở lần poll tới.
   */
  async bulkApplyBatchResult(result: {
    dispatched: string[];
    failed: { tx: string; error: string; nextAttemptAt: Date }[];
  }): Promise<void> {
    const at = new Date();

    const ops: AnyBulkWriteOperation[] = [];

    // Mark orders as dispatched
    for (const tx of result.dispatched) {
      ops.push({
        updateOne: {
          filter: { tx },
          update: {
            $set: {
              status: DispatchOrderStatus.Dispatched,
              dispatchedAt: at,
              lastAttemptAt: at,
              updatedAt: at,
            },
            $unset: { lastError: "" },
          },
        },
      });
    }

    // Mark orders as failed
    for (const f of result.failed) {
      ops.push({
        updateOne: {
          filter: { tx: f.tx },
          update: {
            $inc: { retryCount: 1 },
            $set: {
              lastError: f.error,
              lastAttemptAt: at,
              nextAttemptAt: f.nextAttemptAt,
              updatedAt: at,
            },
          },
        },
      });
    }

    // If no operations, return
    if (ops.length === 0) {
      return;
    }

    // Bulk write operations
    await this.bulkWrite(ops, { ordered: false });
  }

  /** Huỷ 1 order — chỉ cho phép khi chưa dispatched. */
  async cancelOrder(tx: string, at: Date = new Date()): Promise<boolean> {
    return await this.updateOne(
      {
        tx,
        status: DispatchOrderStatus.Pending,
      },
      {
        $set: {
          status: DispatchOrderStatus.Cancelled,
          updatedAt: at,
        },
      },
    );
  }

  /** Tra 1 order theo tx — BO detail view hoặc debug. */
  async findByTx(tx: string): Promise<TenantDispatchOrderEntity | null> {
    return await this.findOne({
      tx,
    });
  }

  /**
   * List orders theo `(gameId, sourceKind, sourceId)` — reverse lookup.
   * Dùng cho BO view "entry X đã có dispatch nào?".
   */
  async listBySource(filter: ListBySourceFilter): Promise<TenantDispatchOrderEntity[]> {
    const mongoFilter: any = {
      gameId: filter.gameId,
      sourceKind: filter.sourceKind,
      sourceId: filter.sourceId,
    };
    if (filter.status) {
      mongoFilter.status = filter.status;
    }

    return await this.findMany(mongoFilter, {
      sort: { createdAt: -1 },
      limit: filter.limit ?? 50,
      skip: filter.skip ?? 0,
    });
  }

  /**
   * List orders đang "stuck" — `Pending` + `retryCount >= minRetryCount`.
   *
   * Dùng cho BO view "Stuck orders" để staff check khi tenant fail kéo dài.
   * Sort `retryCount DESC` để order retry nhiều nhất lên đầu.
   */
  async listStuck(filter: ListStuckFilter = {}): Promise<TenantDispatchOrderEntity[]> {
    const mongoFilter: any = {
      status: DispatchOrderStatus.Pending,
      retryCount: { $gte: filter.minRetryCount ?? RETRY_ALERT_THRESHOLD },
    };

    if (filter.tenantId) {
      mongoFilter.tenantId = filter.tenantId;
    }

    return await this.findMany(mongoFilter, {
      sort: { retryCount: -1, nextAttemptAt: 1 },
      limit: filter.limit ?? 100,
      skip: filter.skip ?? 0,
    });
  }

  /**
   * Aggregate tiến độ của 1 `batchKey` — BO view batch progress.
   *
   * $group by status để đếm + tính min/max timestamps + sum dispatched amount.
   */
  async aggregateBatchProgress(batchKey: string): Promise<BatchProgress | null> {
    const pipeline = [
      {
        $match: {
          batchKey,
        },
      },
      {
        $group: {
          _id: "$batchKey",
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", DispatchOrderStatus.Pending] }, 1, 0] },
          },
          dispatched: {
            $sum: { $cond: [{ $eq: ["$status", DispatchOrderStatus.Dispatched] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", DispatchOrderStatus.Cancelled] }, 1, 0] },
          },
          firstCreatedAt: { $min: "$createdAt" },
          lastDispatchedAt: { $max: "$dispatchedAt" },
          dispatchedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", DispatchOrderStatus.Dispatched] }, "$amount", 0],
            },
          },
        },
      },
    ];

    const result = await this.aggregate(pipeline);
    if (result.length === 0) {
      return null;
    }

    const r = result[0] as any;
    return {
      batchKey: r._id as string,
      total: r.total as number,
      pending: r.pending as number,
      dispatched: r.dispatched as number,
      cancelled: r.cancelled as number,
      firstCreatedAt: r.firstCreatedAt as Date | undefined,
      lastDispatchedAt: r.lastDispatchedAt as Date | undefined,
      dispatchedAmount: r.dispatchedAmount as number,
    };
  }

  /**
   * List orders tổng hợp với cursor pagination cho BO main view.
   *
   * Filter compose theo nhiều dimension (tenant, game, status, sourceKind,
   * retryMode, batchKey, createdAt range). Sort `{ createdAt: -1, _id: -1 }`
   * — lấy order mới nhất lên đầu, `_id` tie-break cho các record cùng giây.
   *
   * Cursor format: `{ createdAt, id }` với `id` là hex string. Fetch `limit + 1`
   * để detect còn trang sau — nếu có, trả về record cuối trong trang hiện tại
   * làm `nextCursor`, KHÔNG bao gồm trong `data`.
   *
   * Index hint: `{ createdAt: -1, _id: -1 }` + optional per-dimension indexes.
   */
  async listWithCursor(filter: ListDispatchOrdersFilter): Promise<ListDispatchOrdersResult> {
    const mongoFilter = this.buildListFilter(filter);

    // Cộng cursor vào filter: lấy các record "cũ hơn" record cuối trang trước.
    // Tie-break qua `_id` để đảm bảo sort stable khi nhiều record trùng `createdAt`.
    if (filter.cursor) {
      const cursorId = new ObjectId(filter.cursor.id);
      mongoFilter.$or = [
        { createdAt: { $lt: filter.cursor.createdAt } },
        { createdAt: filter.cursor.createdAt, _id: { $lt: cursorId } },
      ];
    }

    const docs = await this.findMany(mongoFilter, {
      sort: { createdAt: -1, _id: -1 },
      limit: filter.limit + 1,
    });

    // Detect còn trang sau: fetch (limit + 1), nếu đủ → tách record cuối thành cursor.
    let nextCursor: ListDispatchOrdersResult["nextCursor"] = null;
    let data = docs;
    if (docs.length > filter.limit) {
      data = docs.slice(0, filter.limit);
      const last = data[data.length - 1];
      if (last) {
        nextCursor = {
          createdAt: last.createdAt.toISOString(),
          id: last.id,
        };
      }
    }

    return { data, nextCursor };
  }

  /**
   * Aggregate KPI summary cho 1 query range — dùng cho BO KPI strip.
   *
   * `$facet` 2 nhánh:
   * - `byStatus`: group by `status`, sum count + amount.
   * - `retryBuckets`: chỉ pending + split theo ngưỡng `stuckMinRetry`.
   *
   * Sau đó compose về `DispatchSummary`. KPI KHÔNG chịu ảnh hưởng
   * `status`/`sourceKind`/`retryMode` filter — luôn phản ánh toàn range.
   *
   * Index hint: `{ createdAt: -1 }` (từ bộ lọc range) + per-dimension indexes
   * khi có `tenantId` / `gameId` / `batchKey`.
   */
  async aggregateSummary(filter: DispatchSummaryFilter): Promise<DispatchSummary> {
    const matchStage = this.buildSummaryMatch(filter);
    const stuckMinRetry = filter.stuckMinRetry ?? RETRY_ALERT_THRESHOLD;

    const pipeline: Document[] = [
      // Lọc theo range + dimension bắt buộc trước khi facet để giảm khối lượng scan.
      { $match: matchStage },
      {
        $facet: {
          // Nhánh 1 — count + sumAmount theo status, không phân biệt retry.
          byStatus: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                sumAmount: { $sum: "$amount" },
              },
            },
          ],
          // Nhánh 2 — chỉ pending, split "retrying" (>=1 & <ngưỡng) vs "stuck" (>=ngưỡng).
          retryBuckets: [
            { $match: { status: DispatchOrderStatus.Pending } },
            {
              $group: {
                _id: null,
                retrying: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: [{ $ifNull: ["$retryCount", 0] }, 1] },
                          { $lt: [{ $ifNull: ["$retryCount", 0] }, stuckMinRetry] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                stuck: {
                  $sum: {
                    $cond: [{ $gte: [{ $ifNull: ["$retryCount", 0] }, stuckMinRetry] }, 1, 0],
                  },
                },
              },
            },
          ],
        },
      },
    ];

    const [raw] = await this.aggregate(pipeline);
    return this.mapSummaryResult(raw);
  }

  /**
   * Distinct tenant + game có orders trong range. Dùng cho filter dropdown FE.
   *
   * Range filter only — KHÔNG filter `status`/`retryMode` để Staff luôn chọn được
   * toàn bộ tenants/games đã từng có order trong khoảng thời gian.
   *
   * Index hint: `{ createdAt: 1 }` cho range scan, sau đó in-memory group theo
   * tenant/gameId. Với range 7 ngày × 10k orders → cost thấp.
   */
  async aggregateFacets(filter: DispatchFacetsFilter): Promise<DispatchFacets> {
    const match: Filter<Document> = {};
    if (filter.from || filter.to) {
      const createdAt: Record<string, Date> = {};
      if (filter.from) createdAt.$gte = filter.from;
      if (filter.to) createdAt.$lte = filter.to;
      match.createdAt = createdAt;
    }

    const pipeline: Document[] = [
      // Lọc orders trong range trước khi facet
      { $match: match },
      {
        $facet: {
          // Distinct tenantIds + count
          tenants: [
            {
              $group: {
                _id: "$tenantId",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 50 },
          ],
          // Distinct gameIds + count
          games: [
            {
              $group: {
                _id: "$gameId",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ],
        },
      },
    ];

    const [raw] = await this.aggregate(pipeline);
    const rawTenants = ((raw as any)?.tenants ?? []) as Array<{ _id: string; count: number }>;
    const rawGames = ((raw as any)?.games ?? []) as Array<{ _id: string; count: number }>;

    return {
      tenants: rawTenants.map((r) => ({ value: r._id, count: r.count })),
      games: rawGames.map((r) => ({ value: r._id, count: r.count })),
    };
  }

  /**
   * Build MongoDB filter từ `ListDispatchOrdersFilter` — không include cursor.
   *
   * Cursor được cộng thêm trong `listWithCursor` sau khi gọi hàm này.
   */
  private buildListFilter(filter: ListDispatchOrdersFilter): Filter<Document> {
    const mongoFilter: Filter<Document> = {};

    if (filter.tx) {
      mongoFilter.tx = filter.tx;
    }
    if (filter.tenantId) {
      mongoFilter.tenantId = filter.tenantId;
    }
    if (filter.gameId) {
      mongoFilter.gameId = filter.gameId;
    }
    if (filter.status) {
      mongoFilter.status = filter.status;
    }
    if (filter.sourceKind) {
      mongoFilter.sourceKind = filter.sourceKind;
    }
    if (filter.batchKey) {
      mongoFilter.batchKey = filter.batchKey;
    }
    if (filter.accountId) {
      mongoFilter.accountId = filter.accountId;
    }
    if (filter.username) {
      // Normalize: MegaWin lưu username lowercase (xem toMegawinUsername).
      // Staff có thể gõ uppercase → lowercase trước khi match.
      mongoFilter.username = filter.username.toLowerCase();
    }

    // retryMode map sang MongoDB filter — 3 chế độ không chồng lấn.
    //
    // **Rule:** retryMode CHỈ áp dụng cho orders `Pending`. Orders đã
    // `Dispatched` hoặc `Cancelled` là terminal state — retryCount lưu lại
    // để audit nhưng không còn "retry" gì nữa. Nếu không force `status =
    // Pending`, query sẽ trả về orders đã Dispatched sau N retry → user báo
    // "đang retry" nhưng thực tế đã xong (bug).
    if (filter.retryMode) {
      const stuckMinRetry = filter.stuckMinRetry ?? RETRY_ALERT_THRESHOLD;

      // Auto-scope về Pending. Nếu caller truyền status khác, respect caller
      // (edge case: ops muốn xem "orders Cancelled từng bị stuck" để audit).
      if (!filter.status) {
        mongoFilter.status = DispatchOrderStatus.Pending;
      }

      if (filter.retryMode === "fresh") {
        mongoFilter.retryCount = { $exists: false };
      } else if (filter.retryMode === "retrying") {
        mongoFilter.retryCount = { $gte: 1, $lt: stuckMinRetry };
      } else {
        mongoFilter.retryCount = { $gte: stuckMinRetry };
      }
    }

    if (filter.from || filter.to) {
      const createdAt: Record<string, Date> = {};
      if (filter.from) createdAt.$gte = filter.from;
      if (filter.to) createdAt.$lte = filter.to;
      mongoFilter.createdAt = createdAt;
    }

    return mongoFilter;
  }

  /** Match stage cho `aggregateSummary` — subset của list filter. */
  private buildSummaryMatch(filter: DispatchSummaryFilter): Filter<Document> {
    const mongoFilter: Filter<Document> = {};
    if (filter.tenantId) mongoFilter.tenantId = filter.tenantId;
    if (filter.gameId) mongoFilter.gameId = filter.gameId;
    if (filter.batchKey) mongoFilter.batchKey = filter.batchKey;

    if (filter.from || filter.to) {
      const createdAt: Record<string, Date> = {};
      if (filter.from) createdAt.$gte = filter.from;
      if (filter.to) createdAt.$lte = filter.to;
      mongoFilter.createdAt = createdAt;
    }

    return mongoFilter;
  }

  /** Map raw $facet output → typed `DispatchSummary`. */
  private mapSummaryResult(raw: unknown): DispatchSummary {
    const byStatus = ((raw as any)?.byStatus ?? []) as Array<{
      _id: DispatchOrderStatus;
      count: number;
      sumAmount: number;
    }>;
    const retryBucketsArr = ((raw as any)?.retryBuckets ?? []) as Array<{
      retrying: number;
      stuck: number;
    }>;
    const retryBuckets = retryBucketsArr[0] ?? { retrying: 0, stuck: 0 };

    let total = 0;
    let pending = 0;
    let dispatched = 0;
    let cancelled = 0;
    let totalAmount = 0;
    let dispatchedAmount = 0;

    for (const row of byStatus) {
      total += row.count;
      totalAmount += row.sumAmount;
      if (row._id === DispatchOrderStatus.Pending) {
        pending = row.count;
      } else if (row._id === DispatchOrderStatus.Dispatched) {
        dispatched = row.count;
        dispatchedAmount = row.sumAmount;
      } else if (row._id === DispatchOrderStatus.Cancelled) {
        cancelled = row.count;
      }
    }

    return {
      total,
      pending,
      dispatched,
      cancelled,
      retrying: retryBuckets.retrying,
      stuck: retryBuckets.stuck,
      totalAmount,
      dispatchedAmount,
    };
  }
}
