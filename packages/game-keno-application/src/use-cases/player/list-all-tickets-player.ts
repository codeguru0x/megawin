/**
 * Use Case: List All Tickets (Keno) – Player
 *
 * Lịch sử vé Keno — tất cả trạng thái (chờ xử lý, đã kết sổ, đã hoàn tiền, đã huỷ).
 * Lọc theo ngày tạo vé. Cursor-based pagination dùng _id cho collection lớn.
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { toVNStartOfDay, toVNEndOfDay } from "@megawin/shared/utils";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { mapPlayerTicket } from "./mappers/ticket";
import type {
  PlayerListTicketsInput,
  PlayerListTicketsOutput,
} from "./dto/player.dto";

/**
 * Lấy lịch sử tất cả vé của player Keno.
 * Trả về cả 4 trạng thái: paid, completed, refunded, void.
 * Hỗ trợ lọc theo ngày (from/to) và cursor-based pagination.
 */
export class ListTicketsPlayerUseCase extends ApiGatewayUseCase<
  PlayerListTicketsInput,
  PlayerListTicketsOutput
> {
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
