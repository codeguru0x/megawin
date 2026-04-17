/**
 * Mega 6/45 – Ticket Repository
 *
 * Collection: mega645_tickets
 */

import { Mega645Collections } from "@megawin/game-mega645/entities";
import { TicketStatus, ALL_LISTABLE_STATUSES } from "@megawin/game-core/entities";
import type { AnyBulkWriteOperation, Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";
import { TicketMapper } from "../mappers/ticket-mapper";
import type { TicketEntity } from "@megawin/game-mega645/entities";

/** Aggregate summary từ entries, dùng để sync lại ticket document. */
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

export class TicketRepository extends BaseRepo<TicketEntity, TicketMapper> {
  constructor() {
    super({
      collName: Mega645Collections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }

  async getTicketsByDrawId(drawId: string, page: number, size: number): Promise<TicketEntity[]> {
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

    const docs = await this.findManyAsDocuments(filter, {
      projection: { _id: 1, "progress.totalDraws": 1, "drawPlan.drawCount": 1 },
      sort: { _id: 1 },
      limit,
    });

    return docs.map((d: Document) => ({
      ticketId: d._id.toHexString(),
      totalDraws: d.progress?.totalDraws ?? d.drawPlan?.drawCount ?? 1,
    }));
  }

  async countTicketsByDrawId(drawId: string): Promise<number> {
    return await this.count({ "drawPlan.drawIds": drawId });
  }

  async getTicketById(ticketId: string): Promise<TicketEntity | null> {
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
  ): Promise<TicketEntity[]> {
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

  /**
   * List tất cả vé (cả pending + completed).
   * Lọc theo ngày cược (createdAt). Cursor = _id, sort desc.
   */
  async getTickets(
    tenantId: string,
    accountId: string,
    size: number,
    opts?: {
      from?: Date;
      to?: Date;
      cursor?: string;
    },
  ): Promise<TicketEntity[]> {
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

      const $set = {
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
          update: { $set: $set as Record<string, unknown>, $inc: { version: 1 } },
        },
      });
    }

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }

  /**
   * Kiểm tra ticket tồn tại theo transaction ID (WAL recovery).
   *
   * Recovery scheduler dùng method này để xác định ticket đã được save thành công
   * sau khi confirm debit = success. Nếu ticket exists → markCompleted WAL.
   * Nếu không → rollback credit.
   */
  async existsByTx(tx: string): Promise<boolean> {
    return await this.exists({ tx });
  }
}
