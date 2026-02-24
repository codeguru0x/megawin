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

  /**
   * Scan tickets multi-draw chưa fully enrolled.
   * Cursor-based pagination bằng _id > lastId.
   */
  async findTicketsForAutoEnroll(
    limit: number,
    lastId?: string,
  ): Promise<TicketEntity[]> {
    const filter: Record<string, unknown> = {
      status: TicketStatus.Paid,
      "drawPlan.fullyEnrolled": false,
      "drawPlan.remainingDraws": { $gt: 0 },
    };
    if (lastId) {
      filter._id = { $gt: new ObjectId(lastId) };
    }
    return await this.findMany(filter, { sort: { _id: 1 }, limit });
  }

  /**
   * Atomic enroll 1 draw vào ticket.
   * $ne guard: chỉ push nếu drawId chưa có trong enrolledDrawIds.
   */
  async enrollDraw(
    ticketId: string,
    drawId: string,
    isLastDraw: boolean,
  ): Promise<boolean> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (isLastDraw) {
      $set["drawPlan.fullyEnrolled"] = true;
      $set["drawPlan.remainingDraws"] = 0;
    }

    return await this.updateOne(
      {
        _id: new ObjectId(ticketId),
        "drawPlan.enrolledDrawIds": { $ne: drawId },
      },
      {
        $push: { "drawPlan.enrolledDrawIds": drawId } as any,
        $inc: {
          "drawPlan.enrolledDraws": 1,
          ...(!isLastDraw ? { "drawPlan.remainingDraws": -1 } : {}),
        } as any,
        $set,
      },
    );
  }

  /**
   * Update settle progress trên ticket.
   * Được gọi sau khi settle 1 entry.
   */
  async updateSettleProgress(
    ticketId: string,
    nextDrawId: string | null,
    isCompleted: boolean,
    winAmount: number,
  ): Promise<boolean> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (nextDrawId) {
      $set["progress.nextDrawId"] = nextDrawId;
    }
    if (isCompleted) {
      $set.status = TicketStatus.Completed;
    }

    return await this.updateOne(
      { _id: new ObjectId(ticketId) },
      {
        $inc: {
          "progress.settledDraws": 1,
          "progress.pendingDraws": -1,
          "settlement.totalWinAmount": winAmount,
        } as any,
        $set: {
          ...$set,
          "settlement.lastSettledAt": new Date(),
        },
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
          "progress.pendingDraws": -1,
        },
      },
    );
  }
}
