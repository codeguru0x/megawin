/**
 * Use Case: Get Ticket Entries for Player (Lotto 5/35)
 *
 * Lấy ticket + tất cả entries của ticket đó.
 * Chỉ cho phép player xem ticket của chính mình.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { ObjectId } from "mongodb";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { EntryEntity } from "../../infras/mappers/entry-mapper";
import { mapPlayerTicket } from "./list-tickets-player";
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
    input: PlayerGetTicketEntriesInput
  ): Promise<PlayerGetTicketEntriesOutput> {
    const { tenantId, accountId, ticketId } = input;

    const ticket = await this.ticketRepo.getTicketById(ticketId);

    if (!ticket) {
      throw AppException.notFound("Ticket not found");
    }

    if (ticket.tenantId !== tenantId || ticket.accountId !== accountId) {
      throw AppException.notFound("Ticket not found");
    }

    const entries = await this.entryRepo.findMany(
      { ticketId: new ObjectId(ticket.id) },
      { sort: { drawTime: 1 } }
    );

    return {
      ticket: mapPlayerTicket(ticket),
      entries: entries.map(mapPlayerEntry),
    };
  }
}

function mapPlayerEntry(entry: EntryEntity): PlayerEntryInfo {
  return {
    id: entry.id,
    drawId: entry.drawId,
    drawDate: entry.drawDate,
    drawTime: entry.drawTime.toISOString(),
    status: entry.status,
    amount: entry.amount,
    lineCount: entry.lineCount,
    entrySummary: {
      ticketNo: entry.entrySummary.ticketNo,
      boards: entry.entrySummary.boards.map((b) => ({
        boardNo: b.boardNo,
        playType: b.playType,
        mainNumbers: b.mainNumbers,
        specialNumbers: b.specialNumbers,
        expandedLines: b.expandedLines,
      })),
    },
    result: entry.result
      ? {
          winningMain: [...entry.result.winningMain],
          winningSpecial: entry.result.winningSpecial,
          publishedAt: entry.result.publishedAt.toISOString(),
        }
      : undefined,
    outcome: entry.outcome,
    payout: entry.payout
      ? {
          winAmount: entry.payout.winAmount,
          payoutAmount: entry.payout.payoutAmount,
          tiers: entry.payout.tiers.map((t) => ({
            tier: t.tier,
            hitCount: t.hitCount,
            unitAmount: t.unitAmount,
            amount: t.amount,
          })),
        }
      : undefined,
  };
}
