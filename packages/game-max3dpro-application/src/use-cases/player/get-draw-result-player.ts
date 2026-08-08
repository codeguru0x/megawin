/**
 * Use Case: Get Single Draw Result for Player (Max 3D Pro)
 *
 * Chi tiết kết quả 1 kỳ quay đã settle.
 * Trả 404 nếu draw không tồn tại, chưa settle, hoặc chưa có kết quả.
 *
 * Chỉ 1 DB call (getDrawById) — settleSummary đã denormalized vào DrawDoc
 * bởi CalculateFinancials (step 4 trong settle pipeline).
 *
 * Max 3D Pro có 8 hạng giải:
 *   special, specialSub, first, second, third, fourth, fifth, sixth
 * settleSummary.tiers chứa đủ 8 tiers kể cả winnerCount = 0.
 *
 * Endpoint: GET /games/max3dpro/draw-results/:drawId
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawEntity } from "@megawin/game-max3dpro/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PlayerDrawResultInfo } from "./dto/player.dto";

export interface GetDrawResultPlayerInput {
  drawId: string;
}

/**
 * Lấy chi tiết kết quả kỳ quay Max 3D Pro cho player.
 *
 * settleSummary.tiers ghi đủ 8 hạng giải (kể cả winnerCount = 0).
 * Winnercount và prizeAmount aggregate từ tất cả entries kỳ đó.
 */
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

  // settleSummary.tiers chứa winnerCount + prizeAmount per tier đã tính sẵn.
  // Đủ 8 tiers: special, specialSub, first ... sixth (kể cả winnerCount = 0).
  return {
    drawId: draw.drawId,
    drawDate: draw.drawDate,
    drawNo: draw.drawNo,
    drawTime: draw.drawTime.toISOString(),
    result: {
      special: result.special,
      first: result.first,
      second: result.second,
      third: result.third,
      publishedAt: result.publishedAt.toISOString(),
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
