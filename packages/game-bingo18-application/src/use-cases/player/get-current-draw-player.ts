/**
 * Use Case: Get Current Draw for Player (Bingo 18)
 *
 * Trả thông tin draw active cho player — chỉ gồm thông tin cần cho đặt cược:
 * - Các kỳ đang mở/đóng cược
 * - Kết quả kỳ gần nhất (numbers + sum)
 */

import { ApiGatewayUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { UnfinishedDrawStatus } from "@megawin/game-core/entities";
import { sortBy } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-bingo18/entities";
import type { PlayerGetCurrentDrawOutput, PlayerDrawInfo } from "./dto/player.dto";

/** Player chỉ thấy kỳ đang mở/đóng bán — không lộ Settling/Voiding (chỉ dành cho staff). */
const PLAYER_STATUSES: readonly UnfinishedDrawStatus[] = [
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
];

export class GetCurrentDrawPlayerUseCase extends ApiGatewayUseCase<
  void,
  PlayerGetCurrentDrawOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(): Promise<PlayerGetCurrentDrawOutput> {
    // getUnfinishedDraws (KHÔNG lookback ngày) — kỳ SalesOpen kẹt cũ (staff quên đóng bán) vẫn
    // được player thấy, không bị "biến mất" sau lookbackDays như getActiveDraws trước đây.
    const activeDraws = await this.drawRepo.getUnfinishedDraws(PLAYER_STATUSES);

    // getUnfinishedDraws trả về DESC (drawId:-1); re-sort ASC để currentDraw (mapped[0]) là kỳ
    // sớm nhất chưa đóng — không phải kỳ tương lai xa nhất khi có nhiều kỳ mở đồng thời.
    const mapped = sortBy(activeDraws, (d) => d.drawId).map(mapPlayerDraw);

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
