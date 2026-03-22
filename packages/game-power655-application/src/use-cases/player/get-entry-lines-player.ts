/**
 * Use Case: Get Entry Lines for Player (Power 6/55)
 *
 * Lấy danh sách lines (bộ số con) + kết quả match của 1 entry.
 * Chỉ trả khi entry đã settled (lines chỉ tồn tại sau settle).
 * Chỉ cho phép player xem entry của chính mình.
 *
 * Khác biệt so với Lotto 5/35:
 *   - Line không có special number
 *   - matchResult có bonusMatched thay vì specialMatched
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { EntryStatus } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { TicketLineDoc } from "@megawin/game-power655/entities";
import type {
  PlayerGetEntryLinesInput,
  PlayerGetEntryLinesOutput,
  PlayerLineInfo,
} from "./dto/player.dto";

/**
 * Lấy lines + match result cho 1 entry Power 6/55.
 * Lines chỉ có sau settle. matchResult chứa bonusMatched.
 */
export class GetEntryLinesPlayerUseCase extends ApiGatewayUseCase<
  PlayerGetEntryLinesInput,
  PlayerGetEntryLinesOutput
> {
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
    main: line.main,
    betCount: line.betCount ?? 1,
    matchResult: {
      mainMatchCount: line.matchResult.mainMatchCount,
      bonusMatched: line.matchResult.bonusMatched,
      tier: line.matchResult.tier,
      winAmount: line.matchResult.winAmount,
    },
  };
}
