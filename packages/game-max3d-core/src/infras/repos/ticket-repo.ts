import { TicketStatus } from "@megawin/game-core/entities";
import type { BaseEntity } from "@megawin/data/mongo";
import type { MongoMapper } from "@megawin/data/mongo";
import type { Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";

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

export abstract class AbstractTicketRepository<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity>,
> extends BaseRepo<TEntity, TMapper> {
  async createTicket(doc: Record<string, unknown>): Promise<string> {
    return await this.insertOne(doc as any);
  }

  async getTicketsByDrawId(
    drawId: string,
    page: number,
    size: number
  ): Promise<TEntity[]> {
    return await this.paging({ "drawPlan.drawIds": drawId }, page, size, {
      sort: { createdAt: -1 },
    });
  }

  async countTicketsByDrawId(drawId: string): Promise<number> {
    return await this.count({ "drawPlan.drawIds": drawId });
  }

  async getTicketById(ticketId: string): Promise<TEntity | null> {
    return await this.findOneById(ticketId);
  }

  async getPendingTickets(
    tenantId: string,
    accountId: string,
    size: number,
    cursor?: string
  ): Promise<TEntity[]> {
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

  async getCompletedTickets(
    tenantId: string,
    accountId: string,
    size: number,
    opts?: {
      sortBy?: "betDate" | "drawDate";
      from?: Date;
      to?: Date;
      cursor?: string;
    }
  ): Promise<TEntity[]> {
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

  async syncSummary(
    ticketId: ObjectId,
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
      { _id: ticketId },
      { $set, $inc: { version: 1 } }
    );
  }
}
