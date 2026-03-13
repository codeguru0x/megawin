/**
 * Use Case: List All Tickets (Max 3D) – Player
 *
 * Lấy danh sách tất cả vé (cả pending + completed).
 * Lọc theo ngày cược (createdAt), chuyển đổi sang UTC từ giờ VN.
 * Cursor-based pagination dùng _id cho collection lớn.
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils/date";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { mapPlayerTicket } from "./mappers/ticket";
import type {
  PlayerListTicketsInput,
  PlayerListTicketsOutput,
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
