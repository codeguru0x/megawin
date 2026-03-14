/**
 * Use Case: Get Ticket Entries for Player (Max 3D)
 *
 * Lấy ticket + tất cả entries của ticket đó.
 * Chỉ cho phép player xem ticket của chính mình.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { EntryBoardSnapshot, TicketEntryEntity, EntryPayoutTier } from "@megawin/game-max3d/entities";
import { mapPlayerTicket } from "./mappers/ticket";
import type {
  PlayerGetTicketEntriesInput,
  PlayerGetTicketEntriesOutput,
  PlayerEntryInfo,
} from "./dto/player.dto";

export class GetTicketEntriesPlayerUseCase extends ApiGatewayUseCase<
  PlayerGetTicketEntriesInput,
  PlayerGetTicketEntriesOutput
> {
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(
    input: PlayerGetTicketEntriesInput,
  ): Promise<PlayerGetTicketEntriesOutput> {
    const { tenantId, accountId, ticketId } = input;

    const ticket = await this.ticketRepo.getTicketById(ticketId);

    if (!ticket) {
      throw AppException.notFound("Ticket not found");
    }

    if (ticket.tenantId !== tenantId || ticket.accountId !== accountId) {
      throw AppException.notFound("Ticket not found");
    }

    const entries = await this.entryRepo.findByTicketId(ticket.id);

    return {
      ticket: mapPlayerTicket(ticket),
      entries: entries.map(mapPlayerEntry),
    };
  }
}

function mapPlayerEntry(entry: TicketEntryEntity): PlayerEntryInfo {
  return {
    id: entry.id,
    drawId: entry.drawId,
    status: entry.status,
    amount: entry.amount,
    lineCount: entry.lineCount,
    entrySummary: {
      ticketNo: entry.entrySummary.ticketNo,
      boards: entry.entrySummary.boards.map((b: EntryBoardSnapshot) => ({
        boardNo: b.boardNo,
        playMode: b.playMode,
        playType: b.playType,
        triplets: [...b.triplets],
        lineCount: b.lineCount,
      })),
    },
    result: entry.result
      ? {
          special: entry.result.special,
          first: entry.result.first,
          second: entry.result.second,
          third: entry.result.third,
          publishedAt: entry.result.publishedAt.toISOString(),
        }
      : undefined,
    outcome: entry.outcome,
    payout: entry.payout
      ? {
          winAmount: entry.payout.winAmount,
          payoutAmount: entry.payout.payoutAmount,
          tiers: entry.payout.tiers.map((t: EntryPayoutTier) => ({
            tier: t.tier,
            hitCount: t.hitCount,
            unitAmount: t.unitAmount,
            amount: t.amount,
          })),
        }
      : undefined,
  };
}
