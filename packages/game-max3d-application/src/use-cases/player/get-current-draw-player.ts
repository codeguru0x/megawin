/**
 * Use Case: Get Current Draw for Player (Max 3D)
 *
 * Trả thông tin draw active cho player — chỉ gồm thông tin cần cho đặt cược:
 * - Các kỳ đang mở/đóng cược
 * - Kết quả kỳ gần nhất
 *
 * Max 3D không có Jackpot tích lũy.
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
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

  protected async execute(): Promise<PlayerGetCurrentDrawOutput> {
    const [activeDraws, lastSettled] = await Promise.all([
      this.drawRepo.getActiveDraws(PLAYER_STATUSES),
      this.drawRepo.getLatestSettledDraw(),
    ]);

    const mapped = activeDraws.map(mapPlayerDraw);

    return {
      currentDraw: mapped[0] ?? null,
      activeDraws: mapped,
      lastResult: lastSettled?.result
        ? {
            drawId: lastSettled.drawId,
            drawDate: lastSettled.drawDate,
            drawNo: lastSettled.drawNo,
            special: lastSettled.result.special as [string, string],
            first: lastSettled.result.first as [string, string, string, string],
            second: lastSettled.result.second as [string, string, string, string, string, string],
            third: lastSettled.result.third as [string, string, string, string, string, string, string, string],
            publishedAt: lastSettled.result.publishedAt.toISOString(),
          }
        : null,
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
