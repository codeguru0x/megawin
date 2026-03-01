/**
 * Power 6/55 – Ticket Repository
 *
 * Collection: power655Tickets
 */

import { Power655Collections } from "@megawin/game-power655/entities";
import { TicketStatus } from "@megawin/game-core/entities";
import type { Document, Filter } from "mongodb";
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
const COMPLETED_STATUSES = [
  TicketStatus.Completed,
  TicketStatus.Refunded,
  TicketStatus.Void,
];

export class TicketRepository extends BaseRepo<TicketEntity, TicketMapper> {
  constructor() {
    super({
      collName: Power655Collections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }

  async getTicketsByDrawId(
    drawId: string,
    page: number,
    size: number
  ): Promise<TicketEntity[]> {
    return await this.paging({ "drawPlan.drawIds": drawId }, page, size, {
      sort: { createdAt: -1 },
    });
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
   */
  async getPendingTickets(
    tenantId: string,
    accountId: string,
    limit: number,
    cursor?: string
  ): Promise<TicketEntity[]> {
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
   * Vé đã xử lý xong (completed/refunded/void).
   * Hỗ trợ lọc theo khoảng ngày + cursor-based pagination.
   */
  async getCompletedTickets(
    tenantId: string,
    accountId: string,
    limit: number,
    options: {
      sortBy: string;
      from?: Date;
      to?: Date;
      cursor?: string;
    }
  ): Promise<TicketEntity[]> {
    const filter: Record<string, unknown> = {
      tenantId,
      accountId,
      status: { $in: COMPLETED_STATUSES },
    };

    const sortField =
      options.sortBy === "drawDate"
        ? "drawPlan.drawIds"
        : "createdAt";

    if (options.from || options.to) {
      const dateRange: Record<string, unknown> = {};
      if (options.from) dateRange.$gte = options.from;
      if (options.to) dateRange.$lte = options.to;
      filter.createdAt = dateRange;
    }

    if (options.cursor) {
      filter._id = { $lt: new ObjectId(options.cursor) };
    }

    return await this.findMany(filter, { sort: { _id: -1 }, limit });
  }

  /**
   * Sync ticket summary sau settle.
   * Ghi đè (idempotent) – không dùng $inc.
   */
  async syncSummary(
    ticketId: unknown,
    summary: TicketSummary
  ): Promise<void> {
    const oid =
      ticketId instanceof ObjectId ? ticketId : new ObjectId(String(ticketId));

    const allDone =
      summary.settledCount + summary.voidedCount >= summary.totalDraws;

    const $set: Record<string, unknown> = {
      "progress.settledDrawCount": summary.settledCount,
      "progress.voidDrawCount": summary.voidedCount,
      "settlement.totalWinAmount": summary.totalWinAmount,
      "settlement.totalPayoutAmount": summary.totalWinAmount,
      updatedAt: new Date(),
    };

    if (summary.voidedCount > 0) {
      $set["voidSummary.totalRefundAmount"] = summary.totalRefundedAmount;
      $set["voidSummary.voidDrawCount"] = summary.voidedCount;
    }

    if (allDone) {
      $set.status = TicketStatus.Completed;
    }

    const col = await this.getCollection();
    await col.updateOne({ _id: oid }, { $set });
  }
}
