/**
 * Use Case: List Pending Tickets (Lotto 5/35) – Player
 *
 * Lấy danh sách vé đang chờ xử lý (còn draws chưa settle/void).
 * Trả về TẤT CẢ pending tickets của account, sắp xếp mới nhất trước.
 * Cursor-based pagination dùng _id cho collection lớn.
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";

import { TicketRepository } from "../../infras/repos/ticket-repo";
import type { PlayerListPendingTicketsInput, PlayerListTicketsOutput } from "./dto/player.dto";
import { mapPlayerTicket } from "./mappers/ticket";

/**
 * Lấy danh sách vé pending của player Lotto 5/35.
 *
 * Không lọc theo ngày — pending tickets là trạng thái hiện tại, player cần xem
 * tất cả vé chưa settle/void bất kể ngày mua. Cursor-based pagination.
 */
export class ListPendingTicketsPlayerUseCase extends ApiGatewayUseCase<
  PlayerListPendingTicketsInput,
  PlayerListTicketsOutput
> {
  private readonly ticketRepo = new TicketRepository();

  protected async execute(input: PlayerListPendingTicketsInput): Promise<PlayerListTicketsOutput> {
    const { tenantId, accountId, size, cursor } = input;

    const tickets = await this.ticketRepo.getPendingTickets(tenantId, accountId, size + 1, {
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
