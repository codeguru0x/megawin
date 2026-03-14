/**
 * Use Case: Get Single Draw Result for Player (Bingo 18)
 *
 * Chi tiết kết quả 1 kỳ quay đã settle.
 * Trả 404 nếu draw không tồn tại, chưa settle, hoặc chưa có kết quả.
 *
 * Chỉ 1 DB call (getDrawById) — settleSummary đã denormalized vào DrawDoc
 * bởi CalculateFinancials (trong settle pipeline).
 *
 * Bingo 18 có nhiều loại chơi với giải thưởng khác nhau:
 *   - basic: singleNum (trúng 1/2/3 lần), doubleMatch, tripleMatch
 *   - side bet: sumTotal (tổng 3-18), bigSmallDraw (Lớn/Hòa/Nhỏ)
 *
 * settleSummary chỉ lưu các (playType, matchCount/bet) có winnerCount > 0
 * → compact document, API chỉ trả giải thực tế có người trúng.
 *
 * Endpoint: GET /games/bingo18/draw-results/:drawId
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-bingo18/entities";;
import type { PlayerDrawResultInfo, PlayerBasicPrize, PlayerSideBetPrize } from "./dto/player.dto";

export interface GetDrawResultPlayerInput {
  drawId: string;
}

/**
 * Lấy chi tiết kết quả kỳ quay Bingo 18 cho player.
 *
 * settleSummary.basicPrizes + sideBetPrizes chỉ chứa giải có winnerCount > 0.
 * Nếu kỳ không có ai trúng giải nào → basicPrizes = [] và sideBetPrizes = [].
 */
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

  // settleSummary.basicPrizes + sideBetPrizes chỉ chứa entries có winnerCount > 0.
  // Nếu kỳ không có ai trúng → trả mảng rỗng (không lỗi).
  const basicPrizes: PlayerBasicPrize[] = (summary?.basicPrizes ?? []).map((bp) => ({
    playType: bp.playType,
    matchCount: bp.matchCount,
    tripleKind: bp.tripleKind,
    winnerCount: bp.winnerCount,
    prizePerUnit: bp.prizePerUnit,
  }));

  const sideBetPrizes: PlayerSideBetPrize[] = (summary?.sideBetPrizes ?? []).map((sb) => ({
    playType: sb.playType,
    sum: sb.sum,
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
      numbers: result.numbers,
      sum: result.sum,
      publishedAt: result.publishedAt.toISOString(),
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
