/**
 * Use Case: Get Single Draw Result for Player (Max 3D)
 *
 * Chi tiết kết quả 1 kỳ quay đã settle.
 * Trả 404 nếu draw không tồn tại, chưa settle, hoặc chưa có kết quả.
 *
 * Chỉ 1 DB call (getDrawById) — settleSummary đã denormalized vào DrawDoc
 * bởi CalculateFinancials (step 4 trong settle pipeline).
 *
 * Max 3D có 2 mode chơi:
 *   - basic (4 hạng: special, first, second, third)
 *   - plus (7 hạng: special, first, second, third, fourth, fifth, sixth)
 * settleSummary.basicTiers và plusTiers tách riêng — tương ứng 2 tab trên UI Vietlott.
 * 4 tier đầu trùng tên giữa 2 mode nhưng giá trị giải thưởng khác nhau hoàn toàn.
 *
 * Endpoint: GET /games/max3d/draw-results/:drawId
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawEntity } from "@megawin/game-max3d/entities";
import { AppException } from "@megawin/shared/errors";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { PlayerDrawResultInfo } from "./dto/player.dto";

export interface GetDrawResultPlayerInput {
  drawId: string;
}

/**
 * Lấy chi tiết kết quả kỳ quay Max 3D cho player.
 *
 * settleSummary.basicTiers + plusTiers ghi đủ cả tiers basic + plus mode.
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

  // settleSummary.basicTiers + plusTiers chứa winnerCount + prizeAmount per tier đã tính sẵn.
  // 2 bảng tách riêng — tương ứng 2 tab Max 3D / Max 3D+ trên UI Vietlott.
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
    basicPrizes: draw.settleSummary?.basicTiers ?? [],
    plusPrizes: draw.settleSummary?.plusTiers ?? [],
    vietlottRef: draw.vietlottRef
      ? {
          drawPeriod: draw.vietlottRef.drawPeriod,
          drawDate: draw.vietlottRef.drawDate,
        }
      : undefined,
  };
}
