/**
 * Use Case: List Draw Results for Player (Lotto 5/35)
 *
 * Danh sách kỳ quay đã settle có kết quả — phân trang cursor-based.
 * Filter theo ngày bắt đầu (from). Chỉ trả draws status = "settled" có result.
 *
 * Endpoint: GET /games/lotto535/draw-results?from=YYYY-MM-DD&size=10&cursor=drawId
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import type { DrawEntity } from "@megawin/game-lotto535/entities";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  PlayerDrawResultSummary,
  PlayerListDrawResultsInput,
  PlayerListDrawResultsOutput,
} from "./dto/player.dto";

export class ListDrawResultsPlayerUseCase extends ApiGatewayUseCase<
  PlayerListDrawResultsInput,
  PlayerListDrawResultsOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: PlayerListDrawResultsInput): Promise<PlayerListDrawResultsOutput> {
    const { from, size, cursor } = input;

    const draws = await this.drawRepo.listSettledDraws({
      from,
      size: size + 1,
      cursor,
    });

    const hasMore = draws.length > size;
    const page = hasMore ? draws.slice(0, size) : draws;
    const nextCursor = hasMore ? page[page.length - 1]!.drawId : null;

    return {
      draws: page.map(mapDrawSummary),
      nextCursor,
      size,
    };
  }
}

function mapDrawSummary(draw: DrawEntity): PlayerDrawResultSummary {
  const result = draw.result!;
  const jackpot = draw.jackpot ?? { openingAmount: 0, closingAmount: 0 };

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
    jackpot: jackpot,
    vietlottRef: draw.vietlottRef
      ? {
          drawPeriod: draw.vietlottRef.drawPeriod,
          drawDate: draw.vietlottRef.drawDate,
        }
      : undefined,
  };
}
