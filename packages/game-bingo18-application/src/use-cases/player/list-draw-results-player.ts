/**
 * Use Case: List Draw Results for Player (Bingo 18)
 *
 * Danh sách kỳ quay đã settle — cursor-based pagination.
 * Filter theo ngày (from), chỉ trả draws status = "settled" có result.
 *
 * Tóm tắt (summary) chỉ chứa kết quả quay — không bao gồm bảng giải chi tiết.
 * Xem chi tiết tại GET /games/bingo18/draw-results/:drawId.
 *
 * Bingo 18 quay mỗi 6 phút (240 kỳ/ngày) → pagination quan trọng.
 *
 * Endpoint: GET /games/bingo18/draw-results?from=YYYY-MM-DD&size=N&cursor=drawId
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-bingo18/entities";
import type {
  PlayerListDrawResultsInput,
  PlayerListDrawResultsOutput,
  PlayerDrawResultSummary,
} from "./dto/player.dto";

/**
 * Danh sách kết quả kỳ quay Bingo 18 cho player.
 * Cursor = drawId cuối trang → trang sau dùng cursor này.
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
      numbers: result.numbers,
      sum: result.sum,
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
