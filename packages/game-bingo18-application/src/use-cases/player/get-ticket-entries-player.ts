/**
 * Use Case: Get Ticket Entries for Player (Bingo 18)
 *
 * Lấy ticket + tất cả entries của ticket đó.
 * Chỉ cho phép player xem ticket của chính mình.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { EntryBoardSnapshot, TicketEntryEntity } from "@megawin/game-bingo18/entities";
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

    if (!ticket || ticket.tenantId !== tenantId || ticket.accountId !== accountId) {
      throw AppException.notFound("Không tìm thấy vé.");
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
    status: entry.status,
    amount: entry.amount,
    betCount: entry.betCount,
    entrySummary: {
      ticketNo: entry.entrySummary.ticketNo,
      boards: entry.entrySummary.boards.map((b: EntryBoardSnapshot) => ({
        boardNo: b.boardNo,
        playType: b.playType,
        number: b.number,
        tripleKind: b.tripleKind,
      })),
      sideBets: entry.entrySummary.sideBets.map((s) => ({
        playType: s.playType,
        sum: s.sum,
        bet: s.bet,
      })),
    },
    result: entry.result
      ? {
          numbers: entry.result.numbers,
          sum: entry.result.sum,
          publishedAt: entry.result.publishedAt.toISOString(),
        }
      : undefined,
    outcome: entry.outcome,
    payout: entry.payout
      ? {
          winAmount: entry.payout.winAmount,
          payoutAmount: entry.payout.payoutAmount,
          boardPayouts: entry.payout.boardPayouts.map((bp) => ({
            boardNo: bp.boardNo,
            playType: bp.playType,
            matchCount: bp.matchCount,
            winAmount: bp.winAmount,
          })),
          sideBetPayouts: entry.payout.sideBetPayouts.map((sp) => ({
            playType: sp.playType,
            sum: sp.sum,
            bet: sp.bet,
            outcome: sp.outcome,
            isWin: sp.isWin,
            winAmount: sp.winAmount,
          })),
        }
      : undefined,
  };
}
