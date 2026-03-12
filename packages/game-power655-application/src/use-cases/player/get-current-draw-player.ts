/**
 * Use Case: Get Current Draw for Player (Power 6/55)
 *
 * Trả thông tin draw active cho player — chỉ gồm thông tin cần cho đặt cược:
 * - Các kỳ đang mở/đóng cược
 * - Dual jackpot hiện tại (JP1 + JP2)
 * - Kết quả kỳ gần nhất (gồm bonusNumber)
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import type { DrawEntity } from "@megawin/game-power655/entities";
import type { PlayerGetCurrentDrawOutput, PlayerDrawInfo } from "./dto/player.dto";

const PLAYER_STATUSES = [DrawStatus.SalesOpen, DrawStatus.SalesClosed];

/**
 * Lấy kỳ quay hiện tại + dual jackpot cho player Power 6/55.
 * Trả về JP1 (6/6) và JP2 (5/6+bonus) amounts.
 */
export class GetCurrentDrawPlayerUseCase extends ApiGatewayUseCase<
  void,
  PlayerGetCurrentDrawOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** @inheritdoc */
  protected async execute(): Promise<PlayerGetCurrentDrawOutput> {
    const [activeDraws, lastSettled, activeCycle, globalConfig] = await Promise.all([
      this.drawRepo.getActiveDraws(PLAYER_STATUSES),
      this.drawRepo.getLatestSettledDraw(),
      this.cycleRepo.getActiveCycle(),
      this.getGlobalConfig.run(),
    ]);

    const jp1Current =
      activeCycle?.jackpot1CurrentAmount ?? globalConfig.jackpot.jackpot1.seedAmount;
    const jp2Current =
      activeCycle?.jackpot2CurrentAmount ?? globalConfig.jackpot.jackpot2.seedAmount;

    const mapped = activeDraws.map((d) => mapPlayerDraw(d, jp1Current, jp2Current));

    return {
      currentDraw: mapped[0] ?? null,
      activeDraws: mapped,
      jackpot1CurrentAmount: jp1Current,
      jackpot2CurrentAmount: jp2Current,
      lastResult: lastSettled?.result
        ? {
            drawId: lastSettled.drawId,
            drawDate: lastSettled.drawDate,
            drawNo: lastSettled.drawNo,
            winningMain: [...lastSettled.result.winningMain],
            bonusNumber: lastSettled.result.bonusNumber,
            publishedAt: lastSettled.result.publishedAt.toISOString(),
          }
        : null,
    };
  }
}

function mapPlayerDraw(draw: DrawEntity, jp1Current: number, jp2Current: number): PlayerDrawInfo {
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
    jackpot1CurrentAmount: jp1Current,
    jackpot2CurrentAmount: jp2Current,
  };
}
