/**
 * Use Case: Get Jackpot for Player (Lotto 5/35)
 *
 * Trả thông tin jackpot đơn giản cho player — loại bỏ chi tiết vận hành.
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

export class GetJackpotPlayerUseCase extends ApiGatewayUseCase<
  void,
  PlayerGetJackpotOutput
> {
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(): Promise<PlayerGetJackpotOutput> {
    const [activeCycle, globalConfig] = await Promise.all([
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const config = globalConfig.jackpot;
    const currentAmount = activeCycle?.currentAmount ?? config.seedAmount;
    const threshold = config.splitThreshold;
    const percentage = Math.min(
      Math.round((currentAmount / threshold) * 10000) / 100,
      100
    );

    const nextScheduled = await this.drawRepo.findOne(
      {
        status: {
          $in: [DrawStatus.Scheduled, DrawStatus.SalesOpen, DrawStatus.SalesClosed],
        },
      },
      { sort: { drawTime: 1 } }
    );

    return {
      currentAmount,
      seedAmount: config.seedAmount,
      progress: {
        current: currentAmount,
        threshold,
        percentage,
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
