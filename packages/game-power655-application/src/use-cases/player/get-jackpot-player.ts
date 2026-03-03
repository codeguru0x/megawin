/**
 * Use Case: Get Jackpot for Player (Power 6/55)
 *
 * Trả thông tin dual jackpot đơn giản cho player — loại bỏ chi tiết vận hành.
 * Hiển thị JP1 (6/6) + JP2 (5/6+bonus) + progress tổng hợp.
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

/**
 * Lấy thông tin dual jackpot Power 6/55 cho player.
 * JP1 = trùng 6/6, JP2 = trùng 5/6 + bonus.
 */
export class GetJackpotPlayerUseCase extends ApiGatewayUseCase<
  void,
  PlayerGetJackpotOutput
> {
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** @inheritdoc */
  protected async execute(): Promise<PlayerGetJackpotOutput> {
    const [activeCycle, globalConfig] = await Promise.all([
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const config = globalConfig.jackpot;
    const jp1Amount =
      activeCycle?.jackpot1Current ?? config.jackpot1.seedAmount;
    const jp2Amount =
      activeCycle?.jackpot2Current ?? config.jackpot2.seedAmount;
    const totalCurrent = jp1Amount + jp2Amount;
    const threshold = config.splitThreshold;
    const percentage = Math.min(
      Math.round((totalCurrent / threshold) * 10000) / 100,
      100
    );

    const nextScheduled = await this.drawRepo.getNextScheduledDraw();

    return {
      jackpot1Amount: jp1Amount,
      jackpot2Amount: jp2Amount,
      jp1SeedAmount: config.jackpot1.seedAmount,
      jp2SeedAmount: config.jackpot2.seedAmount,
      progress: {
        totalCurrent,
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
