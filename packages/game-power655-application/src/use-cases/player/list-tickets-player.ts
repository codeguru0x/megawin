/**
 * Power 6/55 – Player Ticket Mapper
 *
 * Shared mapper dùng bởi cả ListPending và ListCompleted use-cases.
 */

import type { TicketEntity } from "@megawin/game-power655/entities";
import type { PlayerTicketSummary } from "./dto/player.dto";

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
      stakePerDraw: ticket.pricing.amountPerDraw,
      totalStake: ticket.pricing.totalAmount,
    },
    boards: ticket.boards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      selection: {
        mainNumbers: b.selection.mainNumbers,
      },
      lineCount: b.derived.expandedLines,
    })),
    progress: {
      settledDrawCount: ticket.progress.settledDraws,
      voidDrawCount: ticket.voidSummary?.voidedDrawCount ?? 0,
    },
    settlement: ticket.settlement
      ? {
          totalWinAmount: ticket.settlement.totalWinAmount,
          lastSettledAt: ticket.settlement.lastSettledAt?.toISOString(),
        }
      : undefined,
    voidSummary: ticket.voidSummary
      ? {
          totalRefundAmount: ticket.voidSummary.totalRefundedAmount,
          voidDrawCount: ticket.voidSummary.voidedDrawCount,
        }
      : undefined,
    createdAt: ticket.createdAt.toISOString(),
  };
}
