/**
 * Use Case: Get Current Draw (Mega 6/45)
 *
 * Lấy tất cả kỳ quay active:
 *   - activeDraws[]: tất cả kỳ active sorted by drawDate
 *   - currentDraw: kỳ đầu tiên (backward compat)
 *   - lastSettledDraw: kỳ settle gần nhất
 *   - jackpotCurrentAmount: đọc từ active jackpot cycle
 *
 * Mega 6/45 theo luật Vietlott: không có split cycle.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { DrawEntity } from "@megawin/game-mega645/entities";;
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
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: GetCurrentDrawInput): Promise<GetCurrentDrawOutput> {
    const allowStatuses = input.allowStatuses ?? ACTIVE_STATUSES;

    const [activeDraws, lastSettled, activeCycle, globalConfig] = await Promise.all([
      this.drawRepo.getActiveDraws(allowStatuses),
      this.drawRepo.getLatestSettledDraw(),
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const jackpotCurrentAmount = activeCycle?.currentAmount ?? globalConfig.jackpot.seedAmount;

    const mapped = activeDraws.map((d) => mapDrawInfo(d, jackpotCurrentAmount));

    return {
      currentDraw: mapped[0] ?? null,
      activeDraws: mapped,
      jackpotCurrentAmount,
      lastSettledDraw: lastSettled
        ? {
            drawId: lastSettled.drawId,
            drawDate: lastSettled.drawDate,
            drawNo: lastSettled.drawNo,
            drawTime: lastSettled.drawTime.toISOString(),
            result: lastSettled.result
              ? {
                  winningMain: [...lastSettled.result.winningMain],
                  publishedAt: lastSettled.result.publishedAt.toISOString(),
                }
              : undefined,
            jackpot: lastSettled.jackpot
              ? {
                  openingAmount: lastSettled.jackpot.openingAmount,
                  closingAmount: lastSettled.jackpot.closingAmount,
                }
              : undefined,
          }
        : null,
    };
  }
}

function mapDrawInfo(draw: DrawEntity, jackpotCurrentAmount: number): CurrentDrawInfo {
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
    jackpotCurrentAmount,
    stats: draw.stats
      ? {
          ticketEntryCount: draw.stats.ticketEntryCount,
          totalLineCount: draw.stats.totalLineCount,
          totalSalesAmount: draw.stats.totalSalesAmount,
        }
      : undefined,
  };
}
