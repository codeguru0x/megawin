import { UseCase } from "@megawin/app-core/use-cases";
import { toVNEndOfDay, toVNStartOfDay } from "@megawin/shared/utils";

import { TicketRepository } from "../../infras/repos/ticket-repo";
import type { PlayerListTicketsInput, PlayerListTicketsOutput } from "./dto/player.dto";
import { mapPlayerTicket } from "./mappers/ticket";

export class ListTicketsPlayerUseCase extends UseCase<PlayerListTicketsInput, PlayerListTicketsOutput> {
  private readonly ticketRepo = new TicketRepository();

  protected async execute(input: PlayerListTicketsInput): Promise<PlayerListTicketsOutput> {
    const { tenantId, accountId, size, from, to, cursor } = input;

    const fromUtc = from ? toVNStartOfDay(from) : undefined;
    const toUtc = to ? toVNEndOfDay(to) : undefined;

    const tickets = await this.ticketRepo.getTickets(tenantId, accountId, size + 1, {
      from: fromUtc,
      to: toUtc,
      cursor,
    });

    const hasMore = tickets.length > size;
    const slice = hasMore ? tickets.slice(0, size) : tickets;

    return {
      tickets: slice.map(mapPlayerTicket),
      nextCursor: hasMore ? slice[slice.length - 1]!.id : null,
      size,
    };
  }
}
