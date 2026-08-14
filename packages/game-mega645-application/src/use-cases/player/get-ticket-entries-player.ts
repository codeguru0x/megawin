/**
 * Use Case: Get Ticket Entries for Player (Mega 6/45)
 *
 * Lấy tất cả entries của ticket — chỉ trả entries, không kèm ticket.
 * Mega 6/45: entry result chỉ có winningNumbers (không có winningSpecial).
 */

import { AppException, UseCase } from "@megawin/app-core/use-cases";
import type { TicketEntryEntity } from "@megawin/game-mega645/entities";

import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import type { PlayerEntryInfo, PlayerGetTicketEntriesInput, PlayerGetTicketEntriesOutput } from "./dto/player.dto";

export class GetTicketEntriesPlayerUseCase extends UseCase<PlayerGetTicketEntriesInput, PlayerGetTicketEntriesOutput> {
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: PlayerGetTicketEntriesInput): Promise<PlayerGetTicketEntriesOutput> {
    const { tenantId, accountId, ticketId } = input;

    const ticket = await this.ticketRepo.getTicketById(ticketId);

    if (!ticket || ticket.tenantId !== tenantId || ticket.accountId !== accountId) {
      throw AppException.notFound("Không tìm thấy vé.");
    }

    const entries = await this.entryRepo.getEntriesByTicketId(ticket.id);

    return {
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
    unitPrice: entry.unitPrice,
    lineCount: entry.lineCount,
    betUnitCount: entry.betUnitCount,
    entrySummary: entry.entrySummary,
    result: entry.result
      ? {
          winningNumbers: entry.result?.winningNumbers,
          publishedAt: entry.result?.publishedAt.toISOString(),
        }
      : undefined,
    outcome: entry.outcome,
    payout: entry.payout
      ? {
          winAmount: entry.payout.winAmount,
          payoutAmount: entry.payout.payoutAmount,
          tiers: entry.payout.tiers,
        }
      : undefined,
  };
}
