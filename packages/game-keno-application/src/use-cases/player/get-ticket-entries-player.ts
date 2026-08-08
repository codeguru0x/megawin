/**
 * Use Case: Get Ticket Entries for Player (Keno)
 *
 * Lấy tất cả entries của ticket — chỉ trả entries, không kèm ticket.
 * Chỉ cho phép player xem ticket của chính mình.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { TicketEntryEntity } from "@megawin/game-keno/entities";
import type { PlayerGetTicketEntriesInput, PlayerGetTicketEntriesOutput, PlayerEntryInfo } from "./dto/player.dto";

export class GetTicketEntriesPlayerUseCase extends ApiGatewayUseCase<
  PlayerGetTicketEntriesInput,
  PlayerGetTicketEntriesOutput
> {
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
    selectionCount: entry.selectionCount,
    betUnitCount: entry.betUnitCount,
    entrySummary: {
      ticketNo: entry.entrySummary.ticketNo,
      boards: entry.entrySummary.boards.map((b) => ({
        boardNo: b.boardNo,
        playType: b.playType,
        // Cơ bản (pick1-pick10): numbers bắt buộc. Bổ sung: undefined.
        ...(b.numbers ? { numbers: b.numbers } : {}),
        // Bổ sung (bigSmall/evenOdd): bet bắt buộc. Cơ bản: undefined.
        ...(b.bet ? { bet: String(b.bet) } : {}),
        betCount: b.betCount,
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
            // Bổ sung (bigSmall/evenOdd): bet + outcome + isWin meaningful.
            ...(bp.bet ? { bet: String(bp.bet) } : {}),
            ...(bp.outcome !== undefined ? { outcome: bp.outcome } : {}),
            isWin: bp.isWin,
            winAmount: bp.winAmount,
          })),
        }
      : undefined,
  };
}
