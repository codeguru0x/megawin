/**
 * Use Case: Get Current Draw (Lotto 5/35)
 *
 * Lấy thông tin kỳ quay hiện tại + kỳ settled gần nhất.
 *
 * Dùng cho:
 *   - Player UI: hiển thị jackpot, countdown, kỳ đang mở để đặt cược
 *   - Backoffice UI: hiển thị trạng thái kỳ hiện tại, thống kê
 *
 * Không có "nextDraw" vì hệ thống không biết trước lịch mở thưởng.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "../../infras/mappers/draw-mapper";
import type {
  GetCurrentDrawInput,
  GetCurrentDrawOutput,
  CurrentDrawInfo,
} from "./dto/current-draw.dto";

export class GetCurrentDrawUseCase extends NextApiUseCase<
  GetCurrentDrawInput,
  GetCurrentDrawOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(
    input: GetCurrentDrawInput,
  ): Promise<GetCurrentDrawOutput> {
    const allowStatuses = input.allowStatuses ?? [
      DrawStatus.SalesOpen,
      DrawStatus.SalesClosed,
    ];

    const [currentDraw, lastSettled] = await Promise.all([
      this.drawRepo.getCurrentDraw(allowStatuses),
      this.drawRepo.getLatestSettledDraw(),
    ]);

    return {
      currentDraw: currentDraw ? mapDrawInfo(currentDraw) : null,
      nextDraw: null,
      lastSettledDraw: lastSettled
        ? {
            drawId: lastSettled.drawId,
            drawDate: lastSettled.drawDate,
            drawNo: lastSettled.drawNo,
            drawTime: lastSettled.drawTime.toISOString(),
            result: lastSettled.result
              ? {
                  winningMain: [...lastSettled.result.winningMain],
                  winningSpecial: lastSettled.result.winningSpecial,
                  publishedAt: lastSettled.result.publishedAt.toISOString(),
                }
              : undefined,
            jackpot: {
              openingAmount: lastSettled.jackpot.openingAmount,
              closingAmount: lastSettled.jackpot.closingAmount,
              isSplitCycle: lastSettled.jackpot.isSplitCycle ?? false,
            },
          }
        : null,
    };
  }
}

/** Map draw entity → API output. */
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
    jackpot: {
      openingAmount: draw.jackpot.openingAmount,
      isSplitCycle: draw.jackpot.isSplitCycle ?? false,
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
