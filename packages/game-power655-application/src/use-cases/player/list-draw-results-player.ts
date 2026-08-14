/**
 * Use Case: List Draw Results for Player (Power 6/55)
 *
 * Danh sách kỳ quay đã settle có kết quả — cursor-based pagination.
 * Filter theo ngày bắt đầu (from), chỉ trả draws status = "settled" có result.
 *
 * Tóm tắt (summary) không bao gồm bảng giải thưởng chi tiết.
 * Xem chi tiết tại GET /games/power655/draw-results/:drawId.
 *
 * Power 6/55 khác Mega 6/45:
 *   - result có thêm bonusNumber
 *   - jackpot kép: openingJackpot1/2 + closingJackpot1/2
 *
 * Endpoint: GET /games/power655/draw-results?from=YYYY-MM-DD&size=N&cursor=drawId
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { DrawEntity } from "@megawin/game-power655/entities";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  PlayerDrawResultSummary,
  PlayerListDrawResultsInput,
  PlayerListDrawResultsOutput,
} from "./dto/player.dto";

/**
 * Danh sách kết quả kỳ quay Power 6/55 cho player.
 * Cursor = drawId cuối trang → trang sau dùng drawId < cursor.
 */
export class ListDrawResultsPlayerUseCase extends UseCase<PlayerListDrawResultsInput, PlayerListDrawResultsOutput> {
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
  const jackpot = draw.jackpot ?? {
    openingJackpot1: 0,
    closingJackpot1: 0,
    openingJackpot2: 0,
    closingJackpot2: 0,
  };

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
    jackpot: jackpot,
    vietlottRef: draw.vietlottRef
      ? {
          drawPeriod: draw.vietlottRef.drawPeriod,
          drawDate: draw.vietlottRef.drawDate,
        }
      : undefined,
  };
}
