/**
 * Max3D Core – Abstract Ticket Repository
 *
 * Shared base cho game-max3d và game-max3dpro.
 */

import { TicketStatus, ALL_LISTABLE_STATUSES } from "@megawin/game-core/entities";
import type { BaseEntity } from "@megawin/data/mongo";
import type { MongoMapper } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";

/**
 * Kết quả aggregate từ entries cho 1 ticket.
 * Dùng để sync lại ticket document qua bulkSyncSummaries.
 */
export interface TicketSummary {
  settledCount: number;
  voidedCount: number;
  /** Tổng kỳ của ticket – lấy từ ticket.drawPlan.drawCount. */
  totalDraws: number;
  totalWinAmount: number;
  totalVoidedAmount: number;
  totalRefundedAmount: number;
  voidedDrawIds: string[];
}

const PENDING_STATUSES = [TicketStatus.Paid];
const COMPLETED_STATUSES = [TicketStatus.Completed, TicketStatus.Refunded, TicketStatus.Void];

export abstract class AbstractTicketRepository<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity>,
> extends BaseRepo<TEntity, TMapper> {
  async createTicket(doc: Record<string, unknown>): Promise<string> {
    return await this.insertOne(doc as any);
  }

  async getTicketsByDrawId(drawId: string, page: number, size: number): Promise<TEntity[]> {
    return await this.paging({ "drawPlan.drawIds": drawId }, page, size, {
      sort: { createdAt: -1 },
    });
  }

  async getTicketsByDrawIdCursor(
    drawId: string,
    cursor?: string,
    limit = 500,
  ): Promise<Array<{ ticketId: string; totalDraws: number }>> {
    const filter: Filter<Document> = { "drawPlan.drawIds": drawId };
    if (cursor) {
      filter._id = { $gt: new ObjectId(cursor) };
    }
    const col = await this.getCollection();
    const docs = await col
      .find(filter, {
        projection: {
          _id: 1,
          "progress.totalDraws": 1,
          "drawPlan.drawCount": 1,
        },
        sort: { _id: 1 },
        limit,
      })
      .toArray();
    return docs.map((d) => ({
      ticketId: (d._id as ObjectId).toHexString(),
      totalDraws: (d as any).progress?.totalDraws ?? (d as any).drawPlan?.drawCount ?? 1,
    }));
  }

  async countTicketsByDrawId(drawId: string): Promise<number> {
    return await this.count({ "drawPlan.drawIds": drawId });
  }

  async getTicketById(ticketId: string): Promise<TEntity | null> {
    return await this.findOneById(ticketId);
  }

  /**
   * Vé đang chờ xử lý (status = paid, còn draws chưa settle/void).
   * Cursor = _id (monotonic với createdAt), sort desc.
   * Trả về TẤT CẢ pending tickets — không lọc theo ngày.
   */
  async getPendingTickets(
    tenantId: string,
    accountId: string,
    size: number,
    opts?: {
      cursor?: string;
    },
  ): Promise<TEntity[]> {
    const { cursor } = opts ?? {};

    const filter: Filter<Document> = {
      tenantId,
      accountId,
      status: { $in: PENDING_STATUSES },
    };

    if (cursor && ObjectId.isValid(cursor)) {
      filter._id = { $lt: new ObjectId(cursor) };
    }

    return await this.findMany(filter, {
      sort: { _id: -1 },
      limit: size,
    });
  }

  async getTickets(
    tenantId: string,
    accountId: string,
    size: number,
    opts?: {
      from?: Date;
      to?: Date;
      cursor?: string;
    },
  ): Promise<TEntity[]> {
    const { from, to, cursor } = opts ?? {};

    const filter: Filter<Document> = {
      tenantId,
      accountId,
      status: { $in: ALL_LISTABLE_STATUSES as string[] },
    };

    if (from || to) {
      const dateRange: Record<string, Date> = {};
      if (from) dateRange.$gte = from;
      if (to) dateRange.$lte = to;
      filter.createdAt = dateRange;
    }

    if (cursor && ObjectId.isValid(cursor)) {
      filter._id = { $lt: new ObjectId(cursor) };
    }

    return await this.findMany(filter, {
      sort: { _id: -1 },
      limit: size,
    });
  }

  async bulkSyncSummaries(
    items: Array<{ ticketId: string; summary: TicketSummary }>,
  ): Promise<number> {
    if (items.length === 0) return 0;
    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = [];

    for (const { ticketId, summary } of items) {
      const { settledCount, voidedCount, totalDraws } = summary;
      const processedCount = settledCount + voidedCount;
      // isAllVoided: tất cả kỳ đều bị void (không có kỳ nào settled) → Refunded.
      // isCompleted: tất cả kỳ đã xử lý xong (settled + voided >= totalDraws) → Completed.
      const isAllVoided = voidedCount === totalDraws && settledCount === 0;
      const isCompleted = processedCount >= totalDraws;
      const status = isAllVoided
        ? TicketStatus.Refunded
        : isCompleted
          ? TicketStatus.Completed
          : undefined;

      const $set: Record<string, unknown> = {
        "progress.settledDraws": processedCount,
        updatedAt: now,
        ...(settledCount > 0 && {
          "settlement.totalWinAmount": summary.totalWinAmount,
          "settlement.lastSettledAt": now,
        }),
        ...(voidedCount > 0 && {
          "voidSummary.voidedDrawCount": voidedCount,
          "voidSummary.totalVoidedAmount": summary.totalVoidedAmount,
          "voidSummary.totalRefundedAmount": summary.totalRefundedAmount,
          "voidSummary.voidedDrawIds": summary.voidedDrawIds,
          "voidSummary.lastVoidedAt": now,
        }),
        ...(status && { status }),
      };

      ops.push({
        updateOne: {
          filter: {
            _id: new ObjectId(ticketId),
            $expr: {
              $lte: [{ $ifNull: ["$progress.settledDraws", 0] }, processedCount],
            },
          },
          update: { $set, $inc: { version: 1 } },
        },
      });
    }
    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }
}
