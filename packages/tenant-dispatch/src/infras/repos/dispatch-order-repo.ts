import type { AnyBulkWriteOperation } from "mongodb";

import { TenantDispatchBaseRepo } from "./base-repo";
import { DispatchOrderMapper } from "../mappers/dispatch-order-mapper";
import { DispatchOrderStatus, DispatchSourceKind } from "../../entities/enums";
import type {
  TenantDispatchOrderEntity,
  TenantDispatchOrderInput,
} from "../../entities/dispatch-order";
import type { TransactionAction, TransactionReason, Currency } from "@megawin/shared/types";
import type {
  PendingDispatchOrder,
  BatchProgress,
  ListBySourceFilter,
  ListStuckFilter,
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
export class DispatchOrderRepository extends TenantDispatchBaseRepo<
  TenantDispatchOrderEntity,
  DispatchOrderMapper
> {
  constructor() {
    super({
      collName: "tenant_dispatch_orders",
      dataMapper: new DispatchOrderMapper(),
    });
  }

  /**
   * Bulk insert orders với tolerance cho duplicate `tx`.
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
    } catch (err: any) {
      const writeErrors = err?.writeErrors ?? [];
      const allDuplicates = writeErrors.every(
        (e: any) => e?.err?.code === 11000 || e?.code === 11000,
      );
      if (!allDuplicates) {
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
  private async queryPending(
    extraFilter: Record<string, unknown>,
    limit: number,
  ): Promise<PendingDispatchOrder[]> {
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
}
