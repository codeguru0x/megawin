/**
 * Use Case: Get Current Draw (Bingo 18)
 *
 * Lấy tất cả kỳ quay chưa hoàn thành (multi-draw support, tối đa 20 kỳ liên tiếp):
 *   - activeDraws[]: tất cả kỳ unfinished sorted by drawId asc
 *   - currentDraw: kỳ đầu tiên (backward compat)
 *
 * Bingo 18 không có Jackpot → không cần đọc jackpot cycle.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { DrawEntity } from "@megawin/game-bingo18/entities";
import { sortBy } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { CurrentDrawInfo, GetCurrentDrawOutput } from "./dto/current-draw.dto";

export class GetCurrentDrawUseCase extends UseCase<void, GetCurrentDrawOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(): Promise<GetCurrentDrawOutput> {
    const unfinishedDraws = await this.drawRepo.getUnfinishedDraws();

    // getUnfinishedDraws trả về DESC (drawId:-1); re-sort ASC để giữ thứ tự hiển thị cũ→mới.
    const mapped = sortBy(unfinishedDraws, (d) => d.drawId).map(mapDrawInfo);

    return {
      currentDraw: mapped[0] ?? null,
      activeDraws: mapped,
    };
  }
}

function mapDrawInfo(draw: DrawEntity): CurrentDrawInfo {
  return {
    drawId: draw.drawId,
    drawDate: draw.drawDate,
    drawNo: draw.drawNo,
    drawTime: draw.drawTime.toISOString(),
    status: draw.status,
    sales: {
      openAt: draw.sales.openAt?.toISOString(),
      closeAt: draw.sales.closeAt.toISOString(),
    },
    result: draw.result
      ? {
          numbers: [...draw.result.numbers],
          sum: draw.result.sum,
          publishedAt: draw.result.publishedAt.toISOString(),
        }
      : undefined,
    stats: draw.stats
      ? {
          ticketEntryCount: draw.stats.ticketEntryCount,
          totalSalesAmount: draw.stats.totalSalesAmount,
        }
      : undefined,
  };
}
