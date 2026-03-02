/**
 * Use Case: Get Entry Lines for Player (Max 3D)
 *
 * Lấy danh sách lines (bộ ba số + kết quả match) của 1 entry.
 * Chỉ trả khi entry đã settled (lines chỉ tồn tại sau settle).
 * Chỉ cho phép player xem entry của chính mình.
 */

import { ApiGatewayUseCase, AppException } from "@megawin/app-core/use-cases";
import { EntryStatus } from "@megawin/game-core/entities";
import { ObjectId } from "mongodb";
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

  protected async execute(
    input: PlayerGetEntryLinesInput
  ): Promise<PlayerGetEntryLinesOutput> {
    const { tenantId, accountId, entryId, page, size } = input;

    const entry = await this.entryRepo.findOne({ _id: new ObjectId(entryId) });

    if (!entry) {
      throw AppException.notFound("Entry not found");
    }

    if (entry.tenantId !== tenantId || entry.accountId !== accountId) {
      throw AppException.notFound("Entry not found");
    }

    if (entry.status !== EntryStatus.Settled) {
      throw AppException.badRequest(
        "Lines chỉ khả dụng khi kỳ đã được xử lý kết quả."
      );
    }

    const { lines, total } = await this.lineRepo.getLinesByEntryId(entryId, {
      page,
      size,
    });

    return {
      entryId: entry.id,
      drawId: entry.drawId,
      lines: lines.map(mapPlayerLine),
      total,
      page,
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
    triplets: [...line.triplets],
    matchResult: {
      tier: line.matchResult.tier,
      winAmount: line.matchResult.winAmount,
    },
  };
}
