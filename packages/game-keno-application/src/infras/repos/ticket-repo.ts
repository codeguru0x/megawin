import { KenoCollections } from "@megawin/game-keno/entities";
import { TicketStatus } from "@megawin/game-core/entities";
import { BaseRepo } from "./base-repo";
import { TicketMapper, type TicketEntity } from "../mappers/ticket-mapper";
import { ObjectId } from "mongodb";

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

  async getTicketsByPlayer(
    tenantId: string,
    accountId: string,
    page: number,
    size: number,
  ): Promise<TicketEntity[]> {
    return await this.paging(
      { tenantId, accountId },
      page,
      size,
      { sort: { createdAt: -1 } },
    );
  }

  /**
   * Update settle progress trên ticket.
   * Được gọi sau khi settle 1 entry.
   */
  async updateSettleProgress(
    ticketId: string,
    isCompleted: boolean,
    winAmount: number,
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
          "settlement.totalWinAmount": winAmount,
        } as any,
      },
    );
  }

  // ─── Void Draw ───

  /**
   * Cập nhật ticket sau khi 1 entry bị void.
   * Multi-draw ticket: partial refund.
   * Single-draw ticket: full refund → status = refunded.
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
        },
      },
    );
  }
}
