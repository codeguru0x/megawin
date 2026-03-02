import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "../../infras/mappers/draw-mapper";
import type {
  GetCurrentDrawInput,
  GetCurrentDrawOutput,
  Bingo18CurrentDrawInfo,
} from "./dto/current-draw.dto";

const ACTIVE_STATUSES = [
  DrawStatus.Scheduled,
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
];

export class GetCurrentDrawUseCase extends NextApiUseCase<
  GetCurrentDrawInput,
  GetCurrentDrawOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(
    input: GetCurrentDrawInput,
  ): Promise<GetCurrentDrawOutput> {
    const allowStatuses = input.allowStatuses ?? ACTIVE_STATUSES;
    const draws = await this.drawRepo.getActiveDraws(allowStatuses);
    const mapped = draws.map(mapDrawInfo);

    return {
      currentDraw: mapped[0] ?? null,
      activeDraws: mapped,
    };
  }
}

function mapDrawInfo(draw: DrawEntity): Bingo18CurrentDrawInfo {
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
    result: draw.result
      ? {
          numbers: [...draw.result.numbers],
          sum: draw.result.sum,
          publishedAt: draw.result.publishedAt.toISOString(),
        }
      : undefined,
    stats: draw.stats
      ? {
          ticketEntryCount: draw.stats.ticketEntryCount,
          totalSalesAmount: draw.stats.totalSalesAmount,
        }
      : undefined,
  };
}
