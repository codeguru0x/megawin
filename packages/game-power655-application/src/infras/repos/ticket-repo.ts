/**
 * Power 6/55 – Ticket Repository
 *
 * Collection: power655Tickets
 */

import { Power655Collections } from "@megawin/game-power655/entities";
import { TicketStatus, ALL_LISTABLE_STATUSES } from "@megawin/game-core/entities";
import type { AnyBulkWriteOperation, Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";
import { TicketMapper } from "../mappers/ticket-mapper";
import type { TicketEntity } from "@megawin/game-power655/entities";

export interface TicketSummary {
  settledCount: number;
  voidedCount: number;
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
      collName: Power655Collections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }

  async getTicketsByDrawId(drawId: string, page: number, size: number): Promise<TicketEntity[]> {
    return await this.paging({ "drawPlan.drawIds": drawId }, page, size, {
      sort: { createdAt: -1 },
    });
  }

  /**
   * Cursor-based pagination qua tickets thuộc 1 draw.
   * Dùng index drawPlan.drawIds. Trả về ticketId + totalDraws.
   */
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
      projection: { _id: 1, "drawPlan.drawCount": 1 },
      sort: { _id: 1 },
      limit,
    });

    return docs.map((d) => ({
      ticketId: (d._id as ObjectId).toHexString(),
      totalDraws: (d as any).drawPlan?.drawCount ?? 1,
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
    limit: number,
    opts?: {
      cursor?: string;
    },
  ): Promise<TicketEntity[]> {
    const { cursor } = opts ?? {};

    const filter: Record<string, unknown> = {
      tenantId,
      accountId,
      status: { $in: PENDING_STATUSES },
    };

    if (cursor) {
      filter._id = { $lt: new ObjectId(cursor) };
    }

    return await this.findMany(filter, { sort: { _id: -1 }, limit });
  }

  /**
   * List tất cả vé (cả pending + completed).
   * Lọc theo ngày cược (createdAt). Cursor = _id, sort desc.
   */
  async getTickets(
    tenantId: string,
    accountId: string,
    limit: number,
    opts?: {
      from?: Date;
      to?: Date;
      cursor?: string;
    },
  ): Promise<TicketEntity[]> {
    const { from, to, cursor } = opts ?? {};

    const filter: Record<string, unknown> = {
      tenantId,
      accountId,
      status: { $in: ALL_LISTABLE_STATUSES as string[] },
    };

    if (from || to) {
      const dateRange: Record<string, unknown> = {};
      if (from) dateRange.$gte = from;
      if (to) dateRange.$lte = to;
      filter.createdAt = dateRange;
    }

    if (cursor) {
      filter._id = { $lt: new ObjectId(cursor) };
    }

    return await this.findMany(filter, { sort: { _id: -1 }, limit });
  }

  /**
   * Bulk sync summaries cho nhiều tickets cùng lúc.
   * Conditional filter: chỉ ghi nếu processedCount mới >= cũ. Race-safe + idempotent.
   */
  async bulkSyncSummaries(
    items: Array<{ ticketId: string; summary: TicketSummary }>,
  ): Promise<number> {
    if (items.length === 0) return 0;

    const now = new Date();
    const ops: AnyBulkWriteOperation<Document>[] = [];

    for (const { ticketId, summary } of items) {
      // progress.settledDraws = settled + voided (tất cả draws đã xử lý xong).
      const processedCount = summary.settledCount + summary.voidedCount;
      const allDone = processedCount >= summary.totalDraws;

      const $set: Record<string, unknown> = {
        "progress.settledDraws": processedCount,
        "settlement.totalWinAmount": summary.totalWinAmount,
        "settlement.lastSettledAt": now,
        updatedAt: now,
      };

      if (summary.voidedCount > 0) {
        $set["voidSummary.totalVoidedAmount"] = summary.totalVoidedAmount;
        $set["voidSummary.totalRefundedAmount"] = summary.totalRefundedAmount;
        $set["voidSummary.voidedDrawCount"] = summary.voidedCount;
        $set["voidSummary.voidedDrawIds"] = summary.voidedDrawIds;
        $set["voidSummary.lastVoidedAt"] = now;
      }

      if (allDone) {
        $set.status = TicketStatus.Completed;
      }

      ops.push({
        updateOne: {
          filter: {
            _id: new ObjectId(ticketId),
            // Race-safe: chỉ ghi nếu processedCount mới >= giá trị hiện tại.
            $expr: {
              $lte: [{ $ifNull: ["$progress.settledDraws", 0] }, processedCount],
            },
          },
          update: { $set },
        },
      });
    }

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }

  /**
   * Sync ticket summary sau settle.
   * Ghi đè (idempotent) – không dùng $inc.
   * Conditional: chỉ ghi nếu processedCount mới >= giá trị hiện tại (race-safe).
   */
  async syncSummary(ticketId: string, summary: TicketSummary): Promise<void> {
    // progress.settledDraws = settled + voided (tất cả draws đã xử lý xong).
    const processedCount = summary.settledCount + summary.voidedCount;
    const allDone = processedCount >= summary.totalDraws;
    const now = new Date();

    const $set: Record<string, unknown> = {
      "progress.settledDraws": processedCount,
      "settlement.totalWinAmount": summary.totalWinAmount,
      "settlement.lastSettledAt": now,
      updatedAt: now,
    };

    if (summary.voidedCount > 0) {
      $set["voidSummary.totalVoidedAmount"] = summary.totalVoidedAmount;
      $set["voidSummary.totalRefundedAmount"] = summary.totalRefundedAmount;
      $set["voidSummary.voidedDrawCount"] = summary.voidedCount;
      $set["voidSummary.voidedDrawIds"] = summary.voidedDrawIds;
      $set["voidSummary.lastVoidedAt"] = now;
    }

    if (allDone) {
      $set.status = TicketStatus.Completed;
    }

    await this.updateOne(
      {
        _id: new ObjectId(ticketId),
        // Race-safe: chỉ ghi nếu processedCount mới >= giá trị hiện tại.
        $expr: {
          $lte: [{ $ifNull: ["$progress.settledDraws", 0] }, processedCount],
        },
      },
      { $set },
    );
  }
}
