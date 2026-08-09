/**
 * Use Case: List Draw Results for Player (Max 3D Pro)
 *
 * Danh sách kỳ quay đã settle có kết quả — cursor-based pagination.
 * Filter theo ngày (from), chỉ trả draws status = "settled" có result.
 *
 * Tóm tắt (summary) chứa kết quả quay — không bao gồm bảng giải chi tiết.
 * Xem chi tiết tại GET /games/max3dpro/draw-results/:drawId.
 *
 * Endpoint: GET /games/max3dpro/draw-results?from=YYYY-MM-DD&size=N&cursor=drawId
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import type { DrawEntity } from "@megawin/game-max3dpro/entities";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  PlayerDrawResultSummary,
  PlayerListDrawResultsInput,
  PlayerListDrawResultsOutput,
} from "./dto/player.dto";

/**
 * Danh sách kết quả kỳ quay Max 3D Pro cho player.
 * Cursor = drawId cuối trang → trang sau dùng drawDate < cursor.
 */
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
    // nextCursor = drawId phần tử cuối trang → trang tiếp theo dùng cursor này.
    const nextCursor = hasMore ? (page[page.length - 1]?.drawId ?? null) : null;

    return {
      draws: page.map(mapDrawSummary),
      nextCursor,
      size,
    };
  }
}

function mapDrawSummary(draw: DrawEntity): PlayerDrawResultSummary {
  const result = draw.result!;

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
    vietlottRef: draw.vietlottRef
      ? {
          drawPeriod: draw.vietlottRef.drawPeriod,
          drawDate: draw.vietlottRef.drawDate,
        }
      : undefined,
  };
}
