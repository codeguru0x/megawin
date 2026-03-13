/**
 * Max3D Core – Abstract Ticket Repository
 *
 * Shared base cho game-max3d và game-max3dpro.
 *
 * Mỗi subclass có thể override `buildVoidSyncSet` để xử lý
 * void summary theo đặc thù riêng (vd: Max3D void theo board, không theo draw).
 */

import { TicketStatus, ALL_LISTABLE_STATUSES } from "@megawin/game-core/entities";
import type { BaseEntity } from "@megawin/data/mongo";
import type { MongoMapper } from "@megawin/data/mongo";
import type { AnyBulkWriteOperation, Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";

/**
 * Kết quả aggregate từ entries cho 1 ticket.
 * Dùng để sync lại ticket document qua bulkSyncSummaries / syncSummary.
 *
 * NOTE: Max3D void theo board (không phải theo draw), nên các void fields
 * (totalVoidedAmount, voidedDrawIds...) không được map vào TicketVoidSummary
 * của Max3D entity. Abstract class giữ đầy đủ fields để subclass có thể dùng
 * tuỳ ý thông qua override buildVoidSyncSet().
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

  /**
   * Trả về các $set fields liên quan đến voidSummary.
   *
   * Default: dùng draw-level void fields (voidedDrawCount, totalVoidedAmount...).
   * Max3D/Max3DPro override để return {} vì void theo board, không theo draw.
   */
  protected buildVoidSyncSet(
    summary: TicketSummary,
    voidedCount: number,
    now: Date,
  ): Record<string, unknown> {
    if (voidedCount === 0) return {};
    return {
      "voidSummary.voidedDrawCount": voidedCount,
      "voidSummary.totalVoidedAmount": summary.totalVoidedAmount,
      "voidSummary.totalRefundedAmount": summary.totalRefundedAmount,
      "voidSummary.voidedDrawIds": summary.voidedDrawIds,
      "voidSummary.lastVoidedAt": now,
    };
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
      const isCompleted = processedCount >= totalDraws;
      const isSingleDrawVoid = totalDraws === 1 && voidedCount === 1;

      let status: string | undefined;
      if (isSingleDrawVoid) {
        status = TicketStatus.Refunded;
      } else if (isCompleted) {
        status = TicketStatus.Completed;
      }

      const $set: Record<string, unknown> = {
        "progress.settledDraws": processedCount,
        updatedAt: now,
      };

      if (settledCount > 0) {
        $set["settlement.totalWinAmount"] = summary.totalWinAmount;
        $set["settlement.lastSettledAt"] = now;
      }

      const voidFields = this.buildVoidSyncSet(summary, voidedCount, now);
      Object.assign($set, voidFields);

      if (status) {
        $set.status = status;
      }

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

  async syncSummary(ticketId: ObjectId, summary: TicketSummary): Promise<boolean> {
    const now = new Date();
    const { settledCount, voidedCount, totalDraws } = summary;
    const processedCount = settledCount + voidedCount;
    const isCompleted = processedCount >= totalDraws;
    const isSingleDrawVoid = totalDraws === 1 && voidedCount === 1;

    let status: string | undefined;
    if (isSingleDrawVoid) {
      status = TicketStatus.Refunded;
    } else if (isCompleted) {
      status = TicketStatus.Completed;
    }

    const $set: Record<string, unknown> = {
      "progress.settledDraws": processedCount,
      updatedAt: now,
    };

    if (settledCount > 0) {
      $set["settlement.totalWinAmount"] = summary.totalWinAmount;
      $set["settlement.lastSettledAt"] = now;
    }

    const voidFields = this.buildVoidSyncSet(summary, voidedCount, now);
    Object.assign($set, voidFields);

    if (status) {
      $set.status = status;
    }

    return await this.updateOne(
      {
        _id: ticketId,
        $expr: {
          $lte: [{ $ifNull: ["$progress.settledDraws", 0] }, processedCount],
        },
      },
      { $set, $inc: { version: 1 } },
    );
  }
}
