/**
 * Use Case: Get Jackpot Current (Mega 6/45)
 *
 * Mega 6/45 theo luật Vietlott: Jackpot chỉ roll-over, không có split threshold.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { JackpotCycleStatus } from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { GetJackpotCurrentOutput } from "./dto/jackpot.dto";

export class GetJackpotCurrentUseCase extends NextApiUseCase<void, GetJackpotCurrentOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(): Promise<GetJackpotCurrentOutput> {
    const [activeCycle, globalConfig] = await Promise.all([
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const config = globalConfig.jackpot;
    const currentAmount = activeCycle?.currentAmount ?? config.seedAmount;

    const nextScheduled = await this.drawRepo.getNextScheduledDraw();

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
      nextDraw: nextScheduled
        ? {
            drawId: nextScheduled.drawId,
            drawTime: nextScheduled.drawTime.toISOString(),
          }
        : undefined,
    };
  }
}
