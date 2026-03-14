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

import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-max3dpro/entities";;
import type {
  GetCurrentDrawInput,
  GetCurrentDrawOutput,
  CurrentDrawInfo,
} from "./dto/current-draw.dto";

const ACTIVE_STATUSES = [
  DrawStatus.Scheduled,
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
];

export class GetCurrentDrawUseCase extends NextApiUseCase<
  GetCurrentDrawInput,
  GetCurrentDrawOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(
    input: GetCurrentDrawInput
  ): Promise<GetCurrentDrawOutput> {
    const allowStatuses = input.allowStatuses ?? ACTIVE_STATUSES;

    const [activeDraws, lastSettled] = await Promise.all([
      this.drawRepo.getActiveDraws(allowStatuses),
      this.drawRepo.getLatestSettledDraw(),
    ]);

    const mapped = activeDraws.map(mapDrawInfo);

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
