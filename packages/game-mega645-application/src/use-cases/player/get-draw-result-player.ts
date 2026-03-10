/**
 * Use Case: Get Single Draw Result for Player (Mega 6/45)
 *
 * Chi tiết kết quả 1 kỳ quay đã settle.
 * Trả 404 nếu draw không tồn tại, chưa settle, hoặc chưa có kết quả.
 *
 * Chỉ 1 DB call (getDrawById) — settleSummary đã denormalized vào DrawDoc
 * bởi CalculateFinancials (step 3 settle pipeline).
 *
 * Endpoint: GET /games/mega645/draw-results/:drawId
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "../../infras/mappers/draw-mapper";
import type { PlayerDrawResultInfo, PlayerDrawTierPrize } from "./dto/player.dto";

export interface GetDrawResultPlayerInput {
  drawId: string;
}

export class GetDrawResultPlayerUseCase extends ApiGatewayUseCase<
  GetDrawResultPlayerInput,
  PlayerDrawResultInfo
> {
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
  // jackpot snapshot được ghi bởi FinalizeSettle — luôn có sau khi settled.
  const jackpot = draw.jackpot ?? { openingAmount: 0, closingAmount: 0 };

  // settleSummary.tiers chứa winnerCount + prizeAmount per tier đã tính sẵn.
  // Tất cả 4 tiers luôn có mặt (kể cả winnerCount = 0).
  // Jackpot prizeAmount = totalJackpotPrize sau khi FinalizeSettle patch.
  const prizes: PlayerDrawTierPrize[] = (draw.settleSummary?.tiers ?? []).map((t) => ({
    tier: t.tier,
    winnerCount: t.winnerCount,
    prizeAmount: t.prizeAmount,
  }));

  return {
    drawId: draw.drawId,
    drawDate: draw.drawDate,
    drawNo: draw.drawNo,
    drawTime: draw.drawTime.toISOString(),
    result: {
      winningMain: [...result.winningMain] as string[],
      publishedAt: result.publishedAt.toISOString(),
    },
    jackpot: {
      openingAmount: jackpot.openingAmount,
      closingAmount: jackpot.closingAmount,
    },
    prizes,
    vietlottRef: draw.vietlottRef
      ? {
          drawPeriod: draw.vietlottRef.drawPeriod,
          drawDate: draw.vietlottRef.drawDate,
        }
      : undefined,
  };
}
