/**
 * Use Case: Get Jackpot Current (Mega 6/45)
 *
 * Mega 6/45 chỉ có 1 kỳ/ngày → splitCycleIntent không cần check drawNo.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { JackpotCycleStatus } from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

export class GetJackpotCurrentUseCase extends NextApiUseCase<
  void,
  GetJackpotCurrentOutput
> {
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(): Promise<GetJackpotCurrentOutput> {
    const [activeCycle, globalConfig] = await Promise.all([
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const config = globalConfig.jackpot;

    const currentAmount = activeCycle?.currentAmount ?? config.seedAmount;
    const threshold = config.splitThreshold;
    const percentage = Math.min((currentAmount / threshold) * 100, 100);

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
      ? currentAmount >= threshold
      : false;

    return {
      cycle: activeCycle
        ? {
            cycleNo: activeCycle.cycleNo,
            status: activeCycle.status,
            seedAmount: activeCycle.seedAmount,
            currentAmount: activeCycle.currentAmount,
            peakAmount: activeCycle.peakAmount,
            totalContribution: activeCycle.totalContribution,
            drawCount: activeCycle.drawCount,
            startDrawId: activeCycle.startDrawId,
            startedAt: activeCycle.startedAt.toISOString(),
            lastSettledDrawId: activeCycle.lastSettledDrawId,
          }
        : {
            cycleNo: 0,
            status: JackpotCycleStatus.Active,
            seedAmount: config.seedAmount,
            currentAmount: config.seedAmount,
            peakAmount: config.seedAmount,
            totalContribution: 0,
            drawCount: 0,
            startDrawId: "",
            startedAt: new Date().toISOString(),
          },
      config: {
        splitThreshold: config.splitThreshold,
        splitRatios: config.splitRatios,
      },
      progress: {
        current: currentAmount,
        threshold,
        percentage: Math.round(percentage * 100) / 100,
        remaining: Math.max(threshold - currentAmount, 0),
      },
      nextDraw: nextScheduled
        ? {
            drawId: nextScheduled.drawId,
            drawTime: nextScheduled.drawTime.toISOString(),
            splitCycleIntent,
          }
        : undefined,
    };
  }
}
