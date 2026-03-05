import { KenoCollections } from "@megawin/game-keno/entities";
import { TicketStatus, ALL_LISTABLE_STATUSES } from "@megawin/game-core/entities";
import { BaseRepo } from "./base-repo";
import { TicketMapper, type TicketEntity } from "../mappers/ticket-mapper";
import type { TicketSortBy } from "../../use-cases/player/dto/player.dto";
import type { AnyBulkWriteOperation, Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";

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
      collName: KenoCollections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }

  async getTicketById(ticketId: string): Promise<TicketEntity | null> {
    return await this.findOne({ _id: new ObjectId(ticketId) });
  }

  /**
   * Vé đang chờ xử lý (status = paid, còn draws chưa settle/void).
   * Sort: createdAt desc (mới nhất trước). Cursor = _id (monotonic với createdAt).
   */
  async getPendingTickets(
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
      status: { $in: PENDING_STATUSES },
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

  /**
   * Lấy tickets thuộc 1 draw qua drawPlan.drawIds.
   * Dùng index idx_drawPlan_drawIds. Trả về ticketId + totalDraws.
   */
  async getTicketsByDrawId(
    drawId: string,
    cursor?: string,
    limit = 200,
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

  /**
   * Bulk sync summaries cho nhiều tickets cùng lúc.
   * Dùng conditional filter: chỉ ghi nếu processedCount mới >= cũ.
   * Idempotent + race-safe.
   */
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

      ops.push({
        updateOne: {
          filter: {
            _id: new ObjectId(ticketId),
            $expr: {
              $lte: [
                {
                  $add: [
                    { $ifNull: ["$progress.settledDraws", 0] },
                    { $ifNull: ["$voidSummary.voidedDrawCount", 0] },
                  ],
                },
                processedCount,
              ],
            },
          },
          update: { $set, $inc: { version: 1 } },
        },
      });
    }

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }

  /**
   * Idempotent: $set toàn bộ summary từ aggregate result.
   * Tính status mới từ settledCount + voidedCount vs totalDraws.
   * Conditional: chỉ ghi nếu processedCount mới >= giá trị hiện tại (race-safe).
   */
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
      {
        _id: ticketId,
        $expr: {
          $lte: [
            {
              $add: [
                { $ifNull: ["$progress.settledDraws", 0] },
                { $ifNull: ["$voidSummary.voidedDrawCount", 0] },
              ],
            },
            processedCount,
          ],
        },
      },
      { $set, $inc: { version: 1 } },
    );
  }
}
