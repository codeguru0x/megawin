/**
 * Keno – Player Ticket Mapper
 *
 * Chuyển đổi TicketEntity → PlayerTicketSummary cho API response.
 * Dùng chung bởi các use cases: ListPending, ListAll, GetTicketEntries.
 */

import type { TicketEntity } from "@megawin/game-keno/entities";
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
      selectionsPerDraw: ticket.pricing.selectionsPerDraw,
      betUnitsPerDraw: ticket.pricing.betUnitsPerDraw,
      amountPerDraw: ticket.pricing.amountPerDraw,
      totalAmount: ticket.pricing.totalAmount,
    },
    // boards[] chứa cả cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd).
    boards: ticket.boards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      ...(b.numbers ? { numbers: b.numbers } : {}),
      ...(b.bet ? { bet: String(b.bet) } : {}),
      betCount: b.betCount,
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
