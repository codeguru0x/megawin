/**
 * Keno – Player Ticket Mapper + ListTickets Use Case
 *
 * Shared mapper dùng bởi cả ListPending, ListCompleted và ListTickets use-cases.
 * ListTicketsPlayerUseCase trả về tất cả vé (pending + completed).
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils/date";
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
    const { tenantId, accountId, size, from, to, cursor } = input;

    const fromUtc = from ? toVNStartOfDay(from) : undefined;
    const toUtc = to ? toVNEndOfDay(to) : undefined;

    const tickets = await this.ticketRepo.getTickets(
      tenantId,
      accountId,
      size + 1,
      { from: fromUtc, to: toUtc, cursor }
    );

    const hasMore = tickets.length > size;
    const slice = hasMore ? tickets.slice(0, size) : tickets;

    return {
      tickets: slice.map(mapPlayerTicket),
      nextCursor: hasMore ? slice[slice.length - 1]!.id : null,
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
