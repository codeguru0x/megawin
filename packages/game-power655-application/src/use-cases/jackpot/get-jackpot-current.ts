/**
 * Use Case: Get Jackpot Current (Power 6/55)
 *
 * Lấy thông tin dual Jackpot hiện tại:
 * - Active cycle (JP1 + JP2 current amounts)
 * - Cấu hình ngưỡng chia (splitThreshold, splitRatios)
 * - Progress bar cho cả JP1, JP2, và tổng
 * - Kỳ tiếp theo (có phải kỳ chia dự kiến không)
 */

import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

/**
 * Lấy trạng thái dual jackpot hiện tại Power 6/55.
 * Trả về JP1 (6/6), JP2 (5/6+bonus), progress, và kỳ quay tiếp theo.
 */
export class GetJackpotCurrentUseCase extends NextApiUseCase<
  void,
  GetJackpotCurrentOutput
> {
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  /** @inheritdoc */
  protected async execute(): Promise<GetJackpotCurrentOutput> {
    const [activeCycle, globalConfig] = await Promise.all([
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const config = globalConfig.jackpot;
    const jp1Current =
      activeCycle?.jackpot1Current ?? config.jackpot1.seedAmount;
    const jp2Current =
      activeCycle?.jackpot2Current ?? config.jackpot2.seedAmount;
    const totalJackpot = jp1Current + jp2Current;
    const threshold = config.splitThreshold;
    const percentage = Math.min((totalJackpot / threshold) * 100, 100);

    const nextScheduled = await this.drawRepo.findOne(
      {
        status: {
          $in: [
            DrawStatus.Scheduled,
            DrawStatus.SalesOpen,
            DrawStatus.SalesClosed,
          ],
        },
      },
      { sort: { drawTime: 1 } }
    );

    const splitCycleIntent = nextScheduled
      ? totalJackpot >= threshold
      : false;

    return {
      cycle: activeCycle
        ? {
            cycleNo: activeCycle.cycleNo,
            status: activeCycle.status,
            jackpot1Current: activeCycle.jackpot1Current,
            jackpot2Current: activeCycle.jackpot2Current,
            jackpot1Opening: activeCycle.jackpot1Opening,
            jackpot2Opening: activeCycle.jackpot2Opening,
            drawCount: activeCycle.drawCount,
            startDrawId: activeCycle.startDrawId,
            startedAt: activeCycle.createdAt.toISOString(),
          }
        : {
            cycleNo: 0,
            status: "active",
            jackpot1Current: config.jackpot1.seedAmount,
            jackpot2Current: config.jackpot2.seedAmount,
            jackpot1Opening: config.jackpot1.seedAmount,
            jackpot2Opening: config.jackpot2.seedAmount,
            drawCount: 0,
            startDrawId: "",
            startedAt: new Date().toISOString(),
          },
      config: {
        splitThreshold: config.splitThreshold,
        splitRatios: config.splitRatios,
      },
      jackpot1Progress: {
        current: jp1Current,
        seed: config.jackpot1.seedAmount,
      },
      jackpot2Progress: {
        current: jp2Current,
        seed: config.jackpot2.seedAmount,
      },
      totalJackpotProgress: {
        current: totalJackpot,
        threshold,
        percentage: Math.round(percentage * 100) / 100,
        remaining: Math.max(threshold - totalJackpot, 0),
      },
      nextDraw: nextScheduled
        ? {
            drawId: nextScheduled.drawId,
            drawNo: nextScheduled.drawNo,
            drawTime: nextScheduled.drawTime.toISOString(),
            splitCycleIntent,
          }
        : undefined,
    };
  }
}
