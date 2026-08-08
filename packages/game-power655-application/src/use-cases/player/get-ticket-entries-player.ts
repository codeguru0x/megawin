/**
 * Use Case: Get Ticket Entries for Player (Power 6/55)
 *
 * Lấy tất cả entries của ticket — chỉ trả entries, không kèm ticket.
 * Chỉ cho phép player xem ticket của chính mình.
 *
 * Entry result chứa bonusNumber thay vì winningSpecial (so với Lotto 5/35).
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { TicketEntryEntity } from "@megawin/game-power655/entities";
import type { PlayerGetTicketEntriesInput, PlayerGetTicketEntriesOutput, PlayerEntryInfo } from "./dto/player.dto";

/**
 * Lấy entries Power 6/55. Player chỉ xem ticket của mình.
 */
export class GetTicketEntriesPlayerUseCase extends ApiGatewayUseCase<
  PlayerGetTicketEntriesInput,
  PlayerGetTicketEntriesOutput
> {
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();

  /** @inheritdoc */
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
          winningMain: entry.result.winningMain,
          bonusNumber: entry.result.bonusNumber,
          publishedAt: entry.result.publishedAt.toISOString(),
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
