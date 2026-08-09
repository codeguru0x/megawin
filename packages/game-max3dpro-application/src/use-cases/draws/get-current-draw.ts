/**
 * Use Case: Get Current Draw (Max 3D Pro)
 *
 * Lấy tất cả kỳ quay active (multi-draw support):
 *   - activeDraws[]: tất cả kỳ active sorted by drawDate+drawNo
 *   - currentDraw: kỳ đầu tiên (backward compat)
 *   - lastSettledDraw: kỳ settle gần nhất
 *
 * Max 3D Pro không có Jackpot → không cần đọc jackpot cycle.
 */

import type { DrawEntity } from "@megawin/game-max3dpro/entities";
import { NextApiUseCase } from "@megawin/next/server";
import { sortBy } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { CurrentDrawInfo, GetCurrentDrawOutput } from "./dto/current-draw.dto";

export class GetCurrentDrawUseCase extends NextApiUseCase<void, GetCurrentDrawOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(): Promise<GetCurrentDrawOutput> {
    const [unfinishedDraws, lastSettled] = await Promise.all([
      this.drawRepo.getUnfinishedDraws(),
      this.drawRepo.getLatestSettledDraw(),
    ]);

    // getUnfinishedDraws trả về DESC (drawId:-1); re-sort ASC để giữ thứ tự hiển thị cũ→mới.
    const mapped = sortBy(unfinishedDraws, (d) => d.drawId).map(mapDrawInfo);

    return {
      currentDraw: mapped[0] ?? null,
      activeDraws: mapped,
      lastSettledDraw: lastSettled
        ? {
            drawId: lastSettled.drawId,
            drawDate: lastSettled.drawDate,
            drawNo: lastSettled.drawNo,
            drawTime: lastSettled.drawTime.toISOString(),
            result: lastSettled.result
              ? {
                  special: [...lastSettled.result.special],
                  first: [...lastSettled.result.first],
                  second: [...lastSettled.result.second],
                  third: [...lastSettled.result.third],
                  publishedAt: lastSettled.result.publishedAt.toISOString(),
                }
              : undefined,
          }
        : null,
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
    stats: draw.stats
      ? {
          ticketEntryCount: draw.stats.ticketEntryCount,
          totalLineCount: draw.stats.totalLineCount,
          totalSalesAmount: draw.stats.totalSalesAmount,
        }
      : undefined,
  };
}
