/**
 * Use Case: Get Single Draw Result for Player (Power 6/55)
 *
 * Chi tiết kết quả 1 kỳ quay đã settle.
 * Trả 404 nếu draw không tồn tại, chưa settle, hoặc chưa có kết quả.
 *
 * Chỉ 1 DB call (getDrawById) — settleSummary đã denormalized vào DrawDoc
 * bởi CalculateFinancials (step 3) và PatchJackpotPrize (step 5 khi có JP winner).
 *
 * Power 6/55 khác Mega 6/45:
 *   - result có thêm bonusNumber
 *   - jackpot kép: openingJackpot1/2 + closingJackpot1/2
 *   - settleSummary.tiers có 5 hạng: jackpot1, jackpot2, tier1, tier2, tier3
 *
 * Endpoint: GET /games/power655/draw-results/:drawId
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawEntity } from "@megawin/game-power655/entities";
import { AppException } from "@megawin/shared/errors";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PlayerDrawResultInfo } from "./dto/player.dto";

export interface GetDrawResultPlayerInput {
  drawId: string;
}

/**
 * Lấy chi tiết kết quả kỳ quay Power 6/55 cho player.
 *
 * settleSummary.tiers được ghi bởi CalculateFinancials (JP = 0) và
 * patch bởi PatchJackpotPrize khi có winner → luôn đầy đủ sau settled.
 */
export class GetDrawResultPlayerUseCase extends UseCase<GetDrawResultPlayerInput, PlayerDrawResultInfo> {
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
  const jackpot = draw.jackpot ?? {
    openingJackpot1: 0,
    closingJackpot1: 0,
    openingJackpot2: 0,
    closingJackpot2: 0,
  };

  // settleSummary.tiers chứa winnerCount + prizeAmount per tier đã tính sẵn.
  // Tất cả 5 tiers luôn có mặt (kể cả winnerCount = 0).
  // JP1/JP2 prizeAmount được patch bởi PatchJackpotPrize sau FinalizeSettle.
  return {
    drawId: draw.drawId,
    drawDate: draw.drawDate,
    drawNo: draw.drawNo,
    drawTime: draw.drawTime.toISOString(),
    result: {
      winningMain: result.winningMain,
      bonusNumber: result.bonusNumber,
      publishedAt: result.publishedAt.toISOString(),
    },
    jackpot: {
      openingJackpot1: jackpot.openingJackpot1,
      closingJackpot1: jackpot.closingJackpot1,
      openingJackpot2: jackpot.openingJackpot2,
      closingJackpot2: jackpot.closingJackpot2,
    },
    prizes: draw.settleSummary?.tiers ?? [],
    vietlottRef: draw.vietlottRef
      ? {
          drawPeriod: draw.vietlottRef.drawPeriod,
          drawDate: draw.vietlottRef.drawDate,
        }
      : undefined,
  };
}
