/**
 * Use Case: List Completed Tickets (Lotto 5/35) – Player
 *
 * Lấy danh sách vé đã hoàn thành (settled, refunded, void).
 * Hỗ trợ lọc theo khoảng ngày (betDate hoặc drawDate).
 * Cursor-based pagination dùng _id cho collection lớn.
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { mapPlayerTicket } from "./list-tickets-player";
import type {
  PlayerListCompletedTicketsInput,
  PlayerListTicketsOutput,
} from "./dto/player.dto";

export class ListCompletedTicketsPlayerUseCase extends ApiGatewayUseCase<
  PlayerListCompletedTicketsInput,
  PlayerListTicketsOutput
> {
  private readonly ticketRepo = new TicketRepository();

  protected async execute(
    input: PlayerListCompletedTicketsInput
  ): Promise<PlayerListTicketsOutput> {
    const { tenantId, accountId, size, sortBy, from, to, cursor } = input;

    const tickets = await this.ticketRepo.getCompletedTickets(
      tenantId,
      accountId,
      size + 1,
      {
        sortBy,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        cursor,
      }
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
