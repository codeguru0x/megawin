import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { displayVNTime, formatVNDate } from "@megawin/shared/utils/date";
import type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

/**
 * Dropdown chọn kỳ quay cho Keno Operations Dashboard.
 *
 * Keno có ~120 kỳ/ngày — group theo trạng thái để tránh quá tải:
 *   - active: đang xử lý (salesOpen/salesClosed/published/settling)
 *   - upcoming: scheduled, chỉ lấy 10 kỳ tiếp theo
 *   - recent: settled trong 2h qua, tối đa 15 kỳ
 *
 * DrawId format: "YYYY-MM-DD.NNN".
 */
export class GetDrawSelectorUseCase extends NextApiUseCase<void, GetDrawSelectorOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(): Promise<GetDrawSelectorOutput> {
    // Lấy tất cả kỳ đang active (không phải settled/void)
    const [activeDraws, upcomingDraws, recentDraws] = await Promise.all([
      this.drawRepo.getActiveDraws([
        DrawStatus.SalesOpen,
        DrawStatus.SalesClosed,
        DrawStatus.Published,
        DrawStatus.Settling,
      ]),
      // Kỳ scheduled sắp tới — lấy 10 kỳ đầu
      this.drawRepo.getActiveDraws([DrawStatus.Scheduled]).then((draws) => draws.slice(0, 10)),
      // Settled gần đây — lấy 15 kỳ cuối (sort drawTime desc)
      this.drawRepo.getActiveDraws([DrawStatus.Settled]).then((draws) =>
        // getActiveDraws sort drawDate/drawNo asc → reverse để lấy mới nhất
        draws.reverse().slice(0, 15),
      ),
    ]);

    const toItem = (
      draw: (typeof activeDraws)[0],
      group: DrawSelectorItem["group"],
    ): DrawSelectorItem => ({
      drawId: draw.drawId,
      drawDate: formatVNDate(new Date(draw.drawDate)),
      drawNo: draw.drawNo,
      drawTime: displayVNTime(draw.drawTime),
      salesCloseAt: draw.sales.closeAt.toISOString(),
      salesOpenAt: draw.sales.openAt?.toISOString(),
      drawResultAt: draw.result?.publishedAt?.toISOString(),
      status: draw.status as DrawStatus,
      financialDate: draw.financialDate,
      group,
    });

    const draws: DrawSelectorItem[] = [
      ...activeDraws.map((d) => toItem(d, "active")),
      ...upcomingDraws.map((d) => toItem(d, "upcoming")),
      ...recentDraws.map((d) => toItem(d, "recent")),
    ];

    return { draws };
  }
}
