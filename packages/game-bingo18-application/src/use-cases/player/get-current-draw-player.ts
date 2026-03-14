/**
 * Use Case: Get Current Draw for Player (Bingo 18)
 *
 * Trả thông tin draw active cho player — chỉ gồm thông tin cần cho đặt cược:
 * - Các kỳ đang mở/đóng cược
 * - Kết quả kỳ gần nhất (numbers + sum)
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-bingo18/entities";;
import type { PlayerGetCurrentDrawOutput, PlayerDrawInfo } from "./dto/player.dto";

const PLAYER_STATUSES = [DrawStatus.SalesOpen, DrawStatus.SalesClosed];

export class GetCurrentDrawPlayerUseCase extends ApiGatewayUseCase<
  void,
  PlayerGetCurrentDrawOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(): Promise<PlayerGetCurrentDrawOutput> {
    const activeDraws = await this.drawRepo.getActiveDraws(PLAYER_STATUSES);

    const mapped = activeDraws.map(mapPlayerDraw);

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
