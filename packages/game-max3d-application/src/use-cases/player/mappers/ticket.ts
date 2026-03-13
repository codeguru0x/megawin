/**
 * Max 3D – Player Ticket Mapper
 *
 * Chuyển đổi TicketEntity → PlayerTicketSummary cho API response.
 * Dùng chung bởi các use cases: ListPending, ListAll, GetTicketEntries.
 */

import type { TicketEntity } from "../../../infras/mappers/ticket-mapper";
import type { PlayerTicketSummary } from "../dto/player.dto";

export function mapPlayerTicket(ticket: TicketEntity): PlayerTicketSummary {
  return {
    id: ticket.id,
    ticketNo: ticket.ticketNo,
    status: ticket.status,
    drawPlan: {
      drawIds: ticket.drawPlan.drawIds,
      drawCount: ticket.drawPlan.drawCount,
    },
    pricing: {
      unitPrice: ticket.pricing.unitPrice,
      linesPerDraw: ticket.pricing.linesPerDraw,
      amountPerDraw: ticket.pricing.amountPerDraw,
      totalAmount: ticket.pricing.totalAmount,
    },
    boards: ticket.boards.map((b) => ({
      boardNo: b.boardNo,
      playMode: b.playMode,
      playType: b.playType,
      triplets: b.selection.triplets,
      lineCount: b.derived.lineCount,
    })),
    progress: {
      totalDraws: ticket.progress.totalDraws,
      settledDraws: ticket.progress.settledDraws,
    },
    settlement: ticket.settlement
      ? {
          totalWinAmount: ticket.settlement.totalWinAmount,
          lastSettledAt: ticket.settlement.lastSettledAt?.toISOString(),
        }
      : undefined,
    voidSummary: ticket.voidSummary
      ? {
          totalVoidedAmount: ticket.voidSummary.totalVoidedAmount,
          totalRefundedAmount: ticket.voidSummary.totalRefundedAmount,
          voidedDrawCount: ticket.voidSummary.voidedDrawCount,
          voidedDrawIds: ticket.voidSummary.voidedDrawIds,
          lastVoidedAt: ticket.voidSummary.lastVoidedAt?.toISOString(),
        }
      : undefined,
    createdAt: ticket.createdAt.toISOString(),
  };
}
