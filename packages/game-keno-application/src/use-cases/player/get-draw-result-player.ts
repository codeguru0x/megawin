/**
 * Use Case: Get Single Draw Result for Player (Keno)
 *
 * Chi tiết kết quả 1 kỳ quay đã settle.
 * Trả 404 nếu draw không tồn tại, chưa settle, hoặc chưa có kết quả.
 *
 * Endpoint: GET /games/keno/draw-results/:drawId
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-keno/entities";;
import type { PlayerDrawResultInfo, PlayerBasicPrize, PlayerSideBetPrize } from "./dto/player.dto";

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
  const summary = draw.settleSummary;

  const basicPrizes: PlayerBasicPrize[] = (summary?.basicPrizes ?? []).map((bp) => ({
    pickCount: bp.pickCount,
    matchCount: bp.matchCount,
    winnerCount: bp.winnerCount,
    prizePerUnit: bp.prizePerUnit,
  }));

  const sideBetPrizes: PlayerSideBetPrize[] = (summary?.sideBetPrizes ?? []).map((sb) => ({
    playType: sb.playType,
    bet: sb.bet,
    winnerCount: sb.winnerCount,
    prizePerUnit: sb.prizePerUnit,
  }));

  return {
    drawId: draw.drawId,
    drawDate: draw.drawDate,
    drawNo: draw.drawNo,
    drawTime: draw.drawTime.toISOString(),
    result: {
      winningNumbers: result.winningNumbers,
      publishedAt: result.publishedAt.toISOString(),
      bigCount: result.bigCount,
      smallCount: result.smallCount,
      evenCount: result.evenCount,
      oddCount: result.oddCount,
    },
    basicPrizes,
    sideBetPrizes,
    vietlottRef: draw.vietlottRef
      ? {
          drawPeriod: draw.vietlottRef.drawPeriod,
          drawDate: draw.vietlottRef.drawDate,
        }
      : undefined,
  };
}
