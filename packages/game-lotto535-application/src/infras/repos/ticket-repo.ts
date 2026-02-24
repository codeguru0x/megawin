/**
 * Lotto 5/35 – Ticket Repository
 *
 * Collection: lotto535Tickets
 */

import { Lotto535Collections } from "@megawin/game-lotto535/entities";
import { TicketStatus } from "@megawin/game-core/entities";
import { ObjectId } from "mongodb";
import { BaseRepo } from "./base-repo";
import { TicketMapper, type TicketEntity } from "../mappers/ticket-mapper";

export class TicketRepository extends BaseRepo<
  TicketEntity,
  TicketMapper
> {
  constructor() {
    super({
      collName: Lotto535Collections.Tickets,
      dataMapper: new TicketMapper(),
    });
  }

  async getTicketsByDrawId(drawId: string, page: number, size: number): Promise<TicketEntity[]> {
    return await this.paging(
      { "drawPlan.enrolledDrawIds": drawId },
      page,
      size,
      { sort: { createdAt: -1 } },
    );
  }

  async countTicketsByDrawId(drawId: string): Promise<number> {
    return await this.count({ "drawPlan.enrolledDrawIds": drawId });
  }

  async getTicketsByPlayer(
    tenantId: string,
    playerId: string,
    page: number,
    size: number,
  ): Promise<TicketEntity[]> {
    return await this.paging(
      { tenantId, playerId },
      page,
      size,
      { sort: { createdAt: -1 } },
    );
  }

  async getTicketById(ticketId: string): Promise<TicketEntity | null> {
    return await this.findOneById(ticketId);
  }

  /**
   * Tìm tickets cần auto-enroll cho kỳ mới.
   * Điều kiện: status = paid, fullyEnrolled = false, remainingDraws > 0.
   * Dùng cursor-based pagination với lastId để xử lý batch lớn.
   */
  async findTicketsForAutoEnroll(
    limit: number,
    afterId?: string,
  ): Promise<TicketEntity[]> {
    const filter: Record<string, unknown> = {
      status: TicketStatus.Paid,
      "drawPlan.fullyEnrolled": false,
      "drawPlan.remainingDraws": { $gt: 0 },
    };
    if (afterId) {
      filter._id = { $gt: new ObjectId(afterId) };
    }
    return await this.findMany(filter, {
      sort: { _id: 1 },
      limit,
    });
  }

  /**
   * Atomic enroll: thêm drawId vào enrolledDrawIds, tăng enrolledDraws, giảm remainingDraws.
   * Guard: chỉ update nếu drawId chưa có trong enrolledDrawIds (idempotent).
   */
  async enrollDraw(
    ticketId: string,
    drawId: string,
    isLastDraw: boolean,
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (isLastDraw) {
      $set["drawPlan.fullyEnrolled"] = true;
    }

    return await this.updateOne(
      {
        _id: new ObjectId(ticketId),
        "drawPlan.enrolledDrawIds": { $ne: drawId },
      },
      {
        $set,
        $push: { "drawPlan.enrolledDrawIds": drawId } as any,
        $inc: {
          "drawPlan.enrolledDraws": 1,
          "drawPlan.remainingDraws": -1,
          "progress.pendingDraws": 1,
        },
      },
    );
  }

  /**
   * Cập nhật ticket progress sau khi settle 1 entry (1 kỳ quay).
   * Atomic increment settledDraws, decrement pendingDraws.
   * Nếu tất cả kỳ đã settle xong & fullyEnrolled → status = completed.
   */
  async updateSettleProgress(
    ticketId: string,
    nextDrawId: string | null,
    isCompleted: boolean,
    entryWinAmount: number,
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      "progress.nextDrawId": nextDrawId,
      "settlement.lastSettledAt": new Date(),
      updatedAt: new Date(),
    };

    if (isCompleted) {
      $set.status = TicketStatus.Completed;
    }

    return await this.updateOne(
      { _id: new ObjectId(ticketId) },
      {
        $set,
        $inc: {
          "progress.settledDraws": 1,
          "progress.pendingDraws": -1,
          "settlement.totalWinAmount": entryWinAmount,
        },
      },
    );
  }

  // ─────────────────────────────────────────────
  // Void Draw
  // ─────────────────────────────────────────────

  /**
   * Cập nhật ticket sau khi 1 entry bị void.
   *
   * - Thêm drawId vào voidedDrawIds
   * - Tăng voidedDrawCount, voidedAmount, refundedAmount
   * - Giảm pendingDraws
   * - Nếu ticket chỉ có 1 kỳ (single-draw) → status = refunded
   * - Nếu multi-draw và tất cả kỳ đã xử lý → status = completed
   */
  async updateVoidProgress(
    ticketId: string,
    drawId: string,
    voidedAmount: number,
    refundAmount: number,
    isFullRefund: boolean,
    isAllDrawsProcessed: boolean,
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      "voidSummary.lastVoidedAt": new Date(),
      updatedAt: new Date(),
    };

    if (isFullRefund) {
      $set.status = TicketStatus.Refunded;
    } else if (isAllDrawsProcessed) {
      $set.status = TicketStatus.Completed;
    }

    return await this.updateOne(
      { _id: new ObjectId(ticketId) },
      {
        $set,
        $push: { "voidSummary.voidedDrawIds": drawId } as any,
        $inc: {
          "voidSummary.voidedDrawCount": 1,
          "voidSummary.totalVoidedAmount": voidedAmount,
          "voidSummary.totalRefundedAmount": refundAmount,
          "progress.pendingDraws": -1,
        },
      },
    );
  }
}
