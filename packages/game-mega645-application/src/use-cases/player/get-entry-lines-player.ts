/**
 * Use Case: Get Entry Lines for Player (Mega 6/45)
 *
 * Mega 6/45 lines: chỉ có numbers (không có special).
 * matchResult: matchCount + tier (không có specialMatched).
 */

import { AppException, UseCase } from "@megawin/app-core/use-cases";
import { EntryStatus } from "@megawin/game-core/entities";
import type { TicketLineDoc } from "@megawin/game-mega645/entities";

import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { PlayerGetEntryLinesInput, PlayerGetEntryLinesOutput, PlayerLineInfo } from "./dto/player.dto";

export class GetEntryLinesPlayerUseCase extends UseCase<PlayerGetEntryLinesInput, PlayerGetEntryLinesOutput> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();

  protected async execute(input: PlayerGetEntryLinesInput): Promise<PlayerGetEntryLinesOutput> {
    const { tenantId, accountId, entryId, size, cursor } = input;

    const entry = await this.entryRepo.getEntryById(entryId);

    if (!entry) {
      throw AppException.notFound("Entry not found");
    }

    if (entry.tenantId !== tenantId || entry.accountId !== accountId) {
      throw AppException.notFound("Entry not found");
    }

    if (entry.status !== EntryStatus.Settled) {
      throw AppException.badRequest("Lines chỉ khả dụng khi kỳ đã được xử lý kết quả.");
    }

    const { lines, hasMore } = await this.lineRepo.getLinesByEntryId(entryId, {
      size,
      cursor,
    });

    return {
      entryId: entry.id,
      drawId: entry.drawId,
      lines: lines.map(mapPlayerLine),
      nextCursor: hasMore ? lines[lines.length - 1]!.lineIndex : null,
      size,
    };
  }
}

function mapPlayerLine(line: TicketLineDoc): PlayerLineInfo {
  return {
    boardNo: line.boardNo,
    lineIndex: line.lineIndex,
    numbers: line.numbers,
    betCount: line.betCount,
    matchResult: {
      matchCount: line.matchResult.matchCount,
      tier: line.matchResult.tier,
      winAmount: line.matchResult.winAmount,
    },
  };
}
