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

export class TicketRepository extends BaseRepo<TicketEntity, TicketMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.Tickets,
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

  async getTicketsByPlayer(
    tenantId: string,
    accountId: string,
    page: number,
    size: number
  ): Promise<TicketEntity[]> {
    return await this.paging({ tenantId, accountId }, page, size, {
      sort: { createdAt: -1 },
    });
  }

  async getTicketById(ticketId: string): Promise<TicketEntity | null> {
    return await this.findOneById(ticketId);
  }

  /**
   * Cập nhật ticket progress sau khi settle 1 entry (1 kỳ quay).
   * Atomic increment settledDraws.
   * Nếu tất cả kỳ đã settle xong → status = completed.
   */
  async updateSettleProgress(
    ticketId: string,
    isCompleted: boolean,
    entryWinAmount: number
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
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
          "settlement.totalWinAmount": entryWinAmount,
        },
      }
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
   * - Nếu ticket chỉ có 1 kỳ (single-draw) → status = refunded
   * - Nếu multi-draw và tất cả kỳ đã xử lý → status = completed
   */
  async updateVoidProgress(
    ticketId: string,
    drawId: string,
    voidedAmount: number,
    refundAmount: number,
    isFullRefund: boolean,
    isAllDrawsProcessed: boolean
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
        },
      }
    );
  }
}
