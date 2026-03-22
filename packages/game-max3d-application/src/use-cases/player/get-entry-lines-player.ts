/**
 * Use Case: Get Entry Lines for Player (Max 3D)
 *
 * Lấy danh sách lines (bộ ba số + kết quả match) của 1 entry.
 * Chỉ trả khi entry đã settled (lines chỉ tồn tại sau settle).
 * Chỉ cho phép player xem entry của chính mình.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { EntryStatus } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { TicketLineDoc } from "@megawin/game-max3d/entities";
import type {
  PlayerGetEntryLinesInput,
  PlayerGetEntryLinesOutput,
  PlayerLineInfo,
} from "./dto/player.dto";

export class GetEntryLinesPlayerUseCase extends ApiGatewayUseCase<
  PlayerGetEntryLinesInput,
  PlayerGetEntryLinesOutput
> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();

  protected async execute(input: PlayerGetEntryLinesInput): Promise<PlayerGetEntryLinesOutput> {
    const { tenantId, accountId, entryId, size, cursor } = input;

    const entry = await this.entryRepo.findByEntryId(entryId);

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
    playMode: line.playMode,
    playType: line.playType,
    triplets: line.triplets,
    betCount: line.betCount ?? 1,
    matchResult: {
      tiers: line.matchResult.tiers.map((t) => ({
        tier: t.tier,
        winAmount: t.winAmount,
      })),
      winAmount: line.matchResult.winAmount,
    },
  };
}
