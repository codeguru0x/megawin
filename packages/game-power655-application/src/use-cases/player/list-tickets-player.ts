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
      unitPrice: 10_000,
      linesPerDraw: ticket.expansion.totalLines,
      stakePerDraw: ticket.stakePerDraw,
      totalStake: ticket.totalStake,
    },
    boards: ticket.boards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      selection: {
        mainNumbers: b.selection.mainNumbers,
      },
      lineCount: b.lineCount,
    })),
    progress: {
      settledDrawCount: ticket.progress.settledDrawCount,
      voidDrawCount: ticket.progress.voidDrawCount,
    },
    settlement: ticket.settlement
      ? {
          totalWinAmount: ticket.settlement.totalWinAmount,
          lastSettledAt: ticket.settlement.lastSettledAt?.toISOString(),
        }
      : undefined,
    voidSummary: ticket.voidSummary
      ? {
          totalRefundAmount: ticket.voidSummary.totalRefundAmount,
          voidDrawCount: ticket.voidSummary.voidDrawCount,
        }
      : undefined,
    createdAt: ticket.createdAt.toISOString(),
  };
}
