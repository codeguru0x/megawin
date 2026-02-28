/**
 * Lotto 5/35 – Player Ticket Mapper
 *
 * Shared mapper dùng bởi cả ListPending và ListCompleted use-cases.
 */

import type { TicketEntity } from "../../infras/mappers/ticket-mapper";
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
      amountPerDraw: ticket.pricing.amountPerDraw,
      totalAmount: ticket.pricing.totalAmount,
    },
    boards: ticket.boards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      selection: {
        mainNumbers: b.selection.mainNumbers,
        specialNumbers: b.selection.specialNumbers,
      },
      expandedLines: b.derived.expandedLines,
    })),
    progress: {
      totalDraws: ticket.progress.totalDraws,
      settledDraws: ticket.progress.settledDraws,
    },
    settlement: ticket.settlement
      ? { totalWinAmount: ticket.settlement.totalWinAmount }
      : undefined,
    createdAt: ticket.createdAt.toISOString(),
  };
}
