/**
 * Use Case: Get Ticket Entries for Player (Keno)
 *
 * Lấy ticket + tất cả entries của ticket đó.
 * Chỉ cho phép player xem ticket của chính mình.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
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
    input: PlayerGetTicketEntriesInput,
  ): Promise<PlayerGetTicketEntriesOutput> {
    const { tenantId, accountId, ticketId } = input;

    const ticket = await this.ticketRepo.getTicketById(ticketId);

    // Kiểm tra vé có tồn tại không
    // Kiểm tra vé có thuộc tenant của player không
    // Kiểm tra vé có thuộc account của player không
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

function mapPlayerEntry(entry: EntryEntity): PlayerEntryInfo {
  return {
    id: entry.id,
    drawId: entry.drawId,
    status: entry.status,
    amount: entry.amount,
    betCount: entry.betCount,
    entrySummary: {
      ticketNo: entry.entrySummary.ticketNo,
      boards: entry.entrySummary.boards.map((b) => ({
        boardNo: b.boardNo,
        playType: b.playType,
        numbers: b.numbers,
      })),
      sideBets: entry.entrySummary.sideBets.map((s) => ({
        playType: s.playType,
        bet: s.bet,
      })),
    },
    result: entry.result
      ? {
          winningNumbers: [...entry.result.winningNumbers],
          publishedAt: entry.result.publishedAt.toISOString(),
          bigCount: entry.result.bigCount,
          smallCount: entry.result.smallCount,
          evenCount: entry.result.evenCount,
          oddCount: entry.result.oddCount,
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
            pickCount: bp.pickCount,
            winAmount: bp.winAmount,
          })),
          sideBetPayouts: entry.payout.sideBetPayouts.map((sp) => ({
            playType: sp.playType,
            bet: sp.bet,
            outcome: sp.outcome,
            isWin: sp.isWin,
            winAmount: sp.winAmount,
          })),
        }
      : undefined,
  };
}
