/**
 * Use Case: Get Single Draw Result for Player (Lotto 5/35)
 *
 * Chi tiết kết quả 1 kỳ quay đã settle.
 * Trả 404 nếu draw không tồn tại, chưa settle, hoặc chưa có kết quả.
 *
 * Endpoint: GET /games/lotto535/draw-results/:drawId
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawEntity } from "@megawin/game-lotto535/entities";
import { AppException } from "@megawin/shared/errors";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PlayerDrawResultInfo } from "./dto/player.dto";

export interface GetDrawResultPlayerInput {
  drawId: string;
}

export class GetDrawResultPlayerUseCase extends ApiGatewayUseCase<GetDrawResultPlayerInput, PlayerDrawResultInfo> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: GetDrawResultPlayerInput): Promise<PlayerDrawResultInfo> {
    const draw = await this.drawRepo.getDrawById(input.drawId);

    if (!draw || draw.status !== DrawStatus.Settled || !draw.result) {
      throw AppException.notFound(`Không tìm thấy kết quả kỳ quay: ${input.drawId}`);
    }

    return mapDrawResult(draw);
  }
}

function mapDrawResult(draw: DrawEntity): PlayerDrawResultInfo {
  const result = draw.result!;
  const jackpot = draw.jackpot ?? { openingAmount: 0, closingAmount: 0 };
  const summary = draw.settleSummary;

  return {
    drawId: draw.drawId,
    drawDate: draw.drawDate,
    drawNo: draw.drawNo,
    drawTime: draw.drawTime.toISOString(),
    result: {
      winningMain: result.winningMain,
      winningSpecial: result.winningSpecial,
      publishedAt: result.publishedAt.toISOString(),
    },
    jackpot: {
      openingAmount: jackpot.openingAmount,
      closingAmount: jackpot.closingAmount,
      isSplitCycle: jackpot.isSplitCycle || undefined,
    },
    prizes: summary?.tiers ?? [],
    vietlottRef: draw.vietlottRef
      ? {
          drawPeriod: draw.vietlottRef.drawPeriod,
          drawDate: draw.vietlottRef.drawDate,
        }
      : undefined,
  };
}
