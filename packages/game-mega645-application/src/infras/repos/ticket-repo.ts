/**
 * Mega 6/45 – Ticket Repository
 *
 * Collection: mega645_tickets
 */

import { Mega645Collections } from "@megawin/game-mega645/entities";
import { TicketStatus } from "@megawin/game-core/entities";
import type { Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";
import { TicketMapper, type TicketEntity } from "../mappers/ticket-mapper";

export type TicketSortBy = "betDate" | "drawDate";

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
      collName: Mega645Collections.Tickets,
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
    size: number,
    cursor?: string
  ): Promise<TicketEntity[]> {
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
   * Vé đã hoàn thành (completed | refunded | void).
   * Hỗ trợ lọc theo khoảng ngày (betDate = createdAt, drawDate = settlement.lastSettledAt).
   * Cursor = _id, sort desc.
   */
  async getCompletedTickets(
    tenantId: string,
    accountId: string,
    size: number,
    opts?: {
      sortBy?: TicketSortBy;
      from?: Date;
      to?: Date;
      cursor?: string;
    }
  ): Promise<TicketEntity[]> {
    const { sortBy = "betDate", from, to, cursor } = opts ?? {};

    const dateField =
      sortBy === "drawDate" ? "settlement.lastSettledAt" : "createdAt";

    const filter: Filter<Document> = {
      tenantId,
      accountId,
      status: { $in: COMPLETED_STATUSES },
    };

    if (from || to) {
      const dateRange: Record<string, Date> = {};
      if (from) dateRange.$gte = from;
      if (to) dateRange.$lte = to;
      filter[dateField] = dateRange;
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
   * Idempotent: $set toàn bộ summary từ aggregate result.
   * Tính status mới từ settledCount + voidedCount vs totalDraws.
   */
  async syncSummary(
    ticketId: string,
    summary: TicketSummary
  ): Promise<boolean> {
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
      "progress.settledDraws": settledCount,
      updatedAt: now,
    };

    if (settledCount > 0) {
      $set["settlement.totalWinAmount"] = summary.totalWinAmount;
      $set["settlement.lastSettledAt"] = now;
    }

    if (voidedCount > 0) {
      $set["voidSummary.voidedDrawCount"] = voidedCount;
      $set["voidSummary.totalVoidedAmount"] = summary.totalVoidedAmount;
      $set["voidSummary.totalRefundedAmount"] = summary.totalRefundedAmount;
      $set["voidSummary.voidedDrawIds"] = summary.voidedDrawIds;
      $set["voidSummary.lastVoidedAt"] = now;
    }

    if (status) {
      $set.status = status;
    }

    return await this.updateOne(
      { _id: new ObjectId(ticketId) },
      { $set, $inc: { version: 1 } }
    );
  }
}
