import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { displayVNTime, formatVNDate } from "@megawin/shared/utils/date";
import type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

/**
 * Dropdown chọn kỳ quay cho Keno Operations Dashboard.
 *
 * Keno có ~120 kỳ/ngày — group theo trạng thái để tránh quá tải:
 *   - active: đang xử lý (salesOpen/salesClosed/published/settling/voiding)
 *   - upcoming: scheduled, chỉ lấy 10 kỳ tiếp theo
 *   - recent: settled/void gần đây, tối đa 15 kỳ
 *
 * DrawId format: "YYYY-MM-DD.NNN".
 */
export class GetDrawSelectorUseCase extends NextApiUseCase<void, GetDrawSelectorOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(): Promise<GetDrawSelectorOutput> {
    const [activeDraws, upcomingDraws, recentDraws] = await Promise.all([
      // Active draws: KHÔNG filter ngày — tránh bỏ sót kỳ đang vận hành bị trễ qua ngày.
      // Bao gồm voiding vì kỳ đang trong quy trình hủy vẫn cần hiển thị để giám sát.
      this.drawRepo.getActiveDraws([
        DrawStatus.SalesOpen,
        DrawStatus.SalesClosed,
        DrawStatus.Published,
        DrawStatus.Settling,
        DrawStatus.Voiding,
      ]),
      // Kỳ scheduled sắp tới — lấy 10 kỳ đầu
      this.drawRepo.getActiveDraws([DrawStatus.Scheduled]).then((draws) => draws.slice(0, 10)),
      // Settled/void gần đây — giới hạn 1 ngày lookback, lấy 15 kỳ cuối (sort drawTime desc)
      this.drawRepo
        .getActiveDraws([DrawStatus.Settled, DrawStatus.Void], 1)
        .then((draws) => draws.reverse().slice(0, 15)),
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
      // drawTime luôn có — giờ quay theo lịch, dùng để pre-fill form sửa lịch
      scheduledDrawAt: draw.drawTime.toISOString(),
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
