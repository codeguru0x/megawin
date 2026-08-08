import { ALL_LISTABLE_STATUSES, TicketStatus } from "@megawin/game-core/entities";
import type { TicketEntity } from "@megawin/game-max3dpro/entities";
import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import type { AnyBulkWriteOperation, Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";

import { TicketMapper } from "../mappers/ticket-mapper";
import { BaseRepo } from "./base-repo";
import type { TicketSummary } from "./types/ticket.types";

/** Statuses được coi là "đang chờ xử lý" — còn draws chưa settle/void. */
const PENDING_STATUSES = [TicketStatus.Paid];

/**
 * Repository quản lý Ticket lifecycle — Max 3D Pro.
 *
 * Chỉ chứa query/update logic cho collection `max3d_pro_tickets`.
 * Atomic insert ticket + entries → dùng `PlaceBetStore`.
 */
export class TicketRepository extends BaseRepo<TicketEntity, TicketMapper> {
  constructor() {
    super({
      collName: Max3dproCollections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }

  /** Lấy tickets của 1 draw, sort by createdAt desc, offset pagination. */
  async getTicketsByDrawId(drawId: string, page: number, size: number): Promise<TicketEntity[]> {
    return await this.paging({ "drawPlan.drawIds": drawId }, page, size, {
      sort: { createdAt: -1 },
    });
  }

  /**
   * Lấy tickets của 1 draw dùng cursor-based pagination — hiệu quả hơn offset khi số lượng lớn.
   * Trả về minimal projection: ticketId + totalDraws.
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

  /** Đếm tickets của 1 draw. */
  async countTicketsByDrawId(drawId: string): Promise<number> {
    return await this.count({ "drawPlan.drawIds": drawId });
  }

  /** Lấy ticket theo ticketId. */
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
    opts?: { cursor?: string },
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
   * Lấy lịch sử tickets của player, hỗ trợ filter date range + cursor pagination.
   * Sort: _id desc (= createdAt desc).
   */
  async getTickets(
    tenantId: string,
    accountId: string,
    size: number,
    opts?: { from?: Date; to?: Date; cursor?: string },
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
   * Batch sync ticket summaries sau khi settle/void nhiều draws.
   *
   * Tính status mới (Completed / Refunded) từ settledCount + voidedCount + totalDraws.
   * Dùng `$expr: { $lte: [settledDraws, processedCount] }` để guard idempotency.
   * Trả về modifiedCount.
   */
  async bulkSyncSummaries(items: Array<{ ticketId: string; summary: TicketSummary }>): Promise<number> {
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
      const status = isAllVoided ? TicketStatus.Refunded : isCompleted ? TicketStatus.Completed : undefined;

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
