/**
 * Use Case: Get Current Draw for Player (Lotto 5/35)
 *
 * Trả thông tin draw active cho player — chỉ gồm thông tin cần cho đặt cược:
 * - Các kỳ đang mở/đóng cược
 * - Jackpot hiện tại
 * - Kết quả kỳ gần nhất
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "../../infras/mappers/draw-mapper";
import type { PlayerGetCurrentDrawOutput, PlayerDrawInfo } from "./dto/player.dto";

const PLAYER_STATUSES = [DrawStatus.SalesOpen, DrawStatus.SalesClosed];

export class GetCurrentDrawPlayerUseCase extends ApiGatewayUseCase<
  void,
  PlayerGetCurrentDrawOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(): Promise<PlayerGetCurrentDrawOutput> {
    const activeDraws = await this.drawRepo.getActiveDraws(PLAYER_STATUSES);
    const mapped = activeDraws.map((d) => mapPlayerDraw(d));

    return {
      currentDraw: mapped[0] ?? null,
      activeDraws: mapped,
    };
  }
}

function mapPlayerDraw(draw: DrawEntity): PlayerDrawInfo {
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
  };
}
