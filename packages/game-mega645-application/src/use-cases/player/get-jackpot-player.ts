import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { PlayerGetJackpotOutput } from "./dto/player.dto";

export class GetJackpotPlayerUseCase extends ApiGatewayUseCase<void, PlayerGetJackpotOutput> {
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(): Promise<PlayerGetJackpotOutput> {
    const [activeCycle, globalConfig] = await Promise.all([
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const currentAmount = activeCycle?.currentAmount ?? globalConfig.jackpot.seedAmount;

    const nextScheduled = await this.drawRepo.getNextScheduledDraw();

    // PlayerGetJackpotOutput yêu cầu progress field.
    // Mega 6/45 không có splitThreshold — dùng seedAmount × 10 làm reference threshold cho UI.
    // Giá trị thực tế là tích luỹ không giới hạn (no split mechanic).
    const referenceThreshold = globalConfig.jackpot.seedAmount * 10;

    return {
      currentAmount,
      seedAmount: globalConfig.jackpot.seedAmount,
      progress: {
        current: currentAmount,
        threshold: referenceThreshold,
        // Phần trăm tiến trình hiển thị = (current / referenceThreshold) × 100, tối đa 100%.
        percentage: Math.min(Math.round((currentAmount / referenceThreshold) * 100), 100),
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
