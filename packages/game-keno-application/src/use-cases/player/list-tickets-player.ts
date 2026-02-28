/**
 * Use Case: List Player Tickets (Keno)
 *
 * Lấy danh sách vé Keno của player — chỉ trả thông tin player cần.
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import type { TicketEntity } from "../../infras/mappers/ticket-mapper";
import type {
  PlayerListTicketsInput,
  PlayerListTicketsOutput,
  PlayerTicketSummary,
} from "./dto/player.dto";

export class ListTicketsPlayerUseCase extends ApiGatewayUseCase<
  PlayerListTicketsInput,
  PlayerListTicketsOutput
> {
  private readonly ticketRepo = new TicketRepository();

  protected async execute(
    input: PlayerListTicketsInput
  ): Promise<PlayerListTicketsOutput> {
    const { tenantId, accountId, page, size } = input;

    const tickets = await this.ticketRepo.getTicketsByPlayer(
      tenantId,
      accountId,
      page,
      size
    );

    return {
      tickets: tickets.map(mapPlayerTicket),
      page,
      size,
    };
  }
}

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
      betsPerDraw: ticket.pricing.betsPerDraw,
      amountPerDraw: ticket.pricing.amountPerDraw,
      totalAmount: ticket.pricing.totalAmount,
    },
    boards: ticket.boards.map((b) => ({
      boardNo: b.boardNo,
      playType: b.playType,
      numbers: b.numbers,
    })),
    sideBets: ticket.sideBets.map((s) => ({
      playType: s.playType,
      bet: s.bet,
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
