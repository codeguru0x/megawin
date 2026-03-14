/**
 * Use Case: List Draw Results for Player (Mega 6/45)
 *
 * Danh sách kỳ quay đã settle có kết quả — cursor-based pagination.
 * Filter theo ngày bắt đầu (from), chỉ trả draws status = "settled" có result.
 *
 * Tóm tắt (summary) không bao gồm bảng giải thưởng chi tiết.
 * Xem chi tiết tại GET /games/mega645/draw-results/:drawId.
 *
 * Endpoint: GET /games/mega645/draw-results?from=YYYY-MM-DD&size=N&cursor=drawId
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-mega645/entities";;
import type {
  PlayerListDrawResultsInput,
  PlayerListDrawResultsOutput,
  PlayerDrawResultSummary,
} from "./dto/player.dto";

export class ListDrawResultsPlayerUseCase extends ApiGatewayUseCase<
  PlayerListDrawResultsInput,
  PlayerListDrawResultsOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: PlayerListDrawResultsInput): Promise<PlayerListDrawResultsOutput> {
    const { from, size, cursor } = input;

    // Lấy size + 1 để detect hasMore mà không cần count query riêng.
    const draws = await this.drawRepo.listSettledDraws({
      from,
      size: size + 1,
      cursor,
    });

    const hasMore = draws.length > size;
    const page = hasMore ? draws.slice(0, size) : draws;
    // nextCursor = drawId phần tử cuối trang → trang tiếp theo dùng drawId < cursor.
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
