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
import { sortBy } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { DrawEntity } from "@megawin/game-mega645/entities";
import type { GetCurrentDrawOutput, CurrentDrawInfo } from "./dto/current-draw.dto";

export class GetCurrentDrawUseCase extends NextApiUseCase<void, GetCurrentDrawOutput> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(): Promise<GetCurrentDrawOutput> {
    const [unfinishedDraws, lastSettled, activeCycle, globalConfig] = await Promise.all([
      this.drawRepo.getUnfinishedDraws(),
      this.drawRepo.getLatestSettledDraw(),
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const jackpotCurrentAmount = activeCycle?.currentAmount ?? globalConfig.jackpot.seedAmount;

    // getUnfinishedDraws trả về DESC (drawId:-1); re-sort ASC để currentDraw (mapped[0]) là kỳ
    // sớm nhất chưa đóng — không phải kỳ tương lai xa nhất khi có nhiều kỳ mở đồng thời.
    const mapped = sortBy(unfinishedDraws, (d) => d.drawId).map((d) =>
      mapDrawInfo(d, jackpotCurrentAmount),
    );

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
                  winningNumbers: lastSettled.result?.winningNumbers ?? [],
                  publishedAt: lastSettled.result?.publishedAt.toISOString(),
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
