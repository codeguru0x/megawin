/**
 * Use Case: Get Ticket Entries for Player (Power 6/55)
 *
 * Lấy ticket + tất cả entries của ticket đó.
 * Chỉ cho phép player xem ticket của chính mình.
 *
 * Entry result chứa bonusNumber thay vì winningSpecial (so với Lotto 5/35).
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { TicketEntryEntity } from "@megawin/game-power655/entities";
import { mapPlayerTicket } from "./list-tickets-player";
import type {
  PlayerGetTicketEntriesInput,
  PlayerGetTicketEntriesOutput,
  PlayerEntryInfo,
} from "./dto/player.dto";

/**
 * Lấy ticket + entries Power 6/55.
 * Player chỉ xem ticket của mình.
 */
export class GetTicketEntriesPlayerUseCase extends ApiGatewayUseCase<
  PlayerGetTicketEntriesInput,
  PlayerGetTicketEntriesOutput
> {
  private readonly ticketRepo = new TicketRepository();
  private readonly entryRepo = new EntryRepository();

  /** @inheritdoc */
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

    const entries = await this.entryRepo.getEntriesByTicketId(ticket.id);

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
    drawDate: entry.drawDate,
    drawTime: entry.drawTime.toISOString(),
    status: entry.status,
    stakeAmount: entry.stakeAmount,
    lineCount: entry.entrySummary.totalLines,
    entrySummary: {
      totalLines: entry.entrySummary.totalLines,
    },
    result: (entry as any).result
      ? {
          winningMain: [...(entry as any).result.winningMain],
          bonusNumber: (entry as any).result.bonusNumber,
          publishedAt: (entry as any).result.publishedAt.toISOString(),
        }
      : undefined,
    outcome: entry.outcome,
    payout: entry.payout
      ? {
          winAmount: entry.payout.winAmount,
          payoutAmount: entry.payout.payoutAmount,
          tiers: entry.payout.tiers.map((t) => ({
            tier: t.tier,
            matchCount: t.matchCount,
            prizePerLine: t.prizePerLine,
            totalPrize: t.totalPrize,
          })),
        }
      : undefined,
  };
}
