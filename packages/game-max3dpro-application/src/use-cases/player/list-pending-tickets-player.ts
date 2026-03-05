import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils/date";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { mapPlayerTicket } from "./list-tickets-player";
import type {
  PlayerListPendingTicketsInput,
  PlayerListTicketsOutput,
} from "./dto/player.dto";

export class ListPendingTicketsPlayerUseCase extends ApiGatewayUseCase<
  PlayerListPendingTicketsInput,
  PlayerListTicketsOutput
> {
  private readonly ticketRepo = new TicketRepository();

  protected async execute(
    input: PlayerListPendingTicketsInput
  ): Promise<PlayerListTicketsOutput> {
    const { tenantId, accountId, size, from, to, cursor } = input;

    const fromUtc = from ? toVNStartOfDay(from) : undefined;
    const toUtc = to ? toVNEndOfDay(to) : undefined;

    const tickets = await this.ticketRepo.getPendingTickets(
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
