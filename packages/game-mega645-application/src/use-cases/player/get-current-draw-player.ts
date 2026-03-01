import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigUseCase } from "../game-config/get-global-config";
import type { DrawEntity } from "../../infras/mappers/draw-mapper";
import type {
  PlayerGetCurrentDrawOutput,
  PlayerDrawInfo,
} from "./dto/player.dto";

const PLAYER_STATUSES = [
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
];

export class GetCurrentDrawPlayerUseCase extends ApiGatewayUseCase<
  void,
  PlayerGetCurrentDrawOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(): Promise<PlayerGetCurrentDrawOutput> {
    const [activeDraws, lastSettled, activeCycle, globalConfig] =
      await Promise.all([
        this.drawRepo.getActiveDraws(PLAYER_STATUSES),
        this.drawRepo.getLatestSettledDraw(),
        this.cycleRepo.getActiveCycle(),
        this.getGlobalConfig.run(),
      ]);

    const jackpotCurrentAmount =
      activeCycle?.currentAmount ?? globalConfig.jackpot.seedAmount;

    const mapped = activeDraws.map((d) =>
      mapPlayerDraw(d, jackpotCurrentAmount)
    );

    return {
      currentDraw: mapped[0] ?? null,
      activeDraws: mapped,
      jackpotCurrentAmount,
      lastResult: lastSettled?.result
        ? {
            drawId: lastSettled.drawId,
            drawDate: lastSettled.drawDate,
            drawNo: lastSettled.drawNo,
            winningMain: [...lastSettled.result.winningMain],
            publishedAt: lastSettled.result.publishedAt.toISOString(),
          }
        : null,
    };
  }
}

function mapPlayerDraw(
  draw: DrawEntity,
  jackpotCurrentAmount: number
): PlayerDrawInfo {
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
  };
}
