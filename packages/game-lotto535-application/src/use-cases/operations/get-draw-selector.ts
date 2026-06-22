import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { yesterdayVN } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-lotto535/entities";
import type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

/**
 * Lấy danh sách kỳ quay cho draw selector dropdown trên dashboard vận hành.
 *
 * Trả về 3 nhóm:
 * - active: kỳ đang xử lý (salesOpen, salesClosed, published, settling, voiding)
 * - future: kỳ scheduled trong 14 ngày tới (chưa đến)
 * - recent: kỳ đã xong trong 48h qua (settled, void)
 *
 * Sorted theo drawDate + drawNo asc (trong mỗi nhóm).
 */
export class GetDrawSelectorUseCase extends NextApiUseCase<void, GetDrawSelectorOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(_input: void): Promise<GetDrawSelectorOutput> {
    // Lấy tất cả kỳ trong trạng thái active + scheduled (lookback 3 ngày, lookahead qua getActiveDraws)
    const activeStatuses = [
      DrawStatus.SalesOpen,
      DrawStatus.SalesClosed,
      DrawStatus.Published,
      DrawStatus.Settling,
      DrawStatus.Voiding,
    ];

    const recentStatuses = [DrawStatus.Settled, DrawStatus.Void];

    const [activeDraws, recentDraws, scheduledDraws] = await Promise.all([
      // Active: lookback 1 ngày (đề phòng kỳ xử lý qua đêm)
      this.drawRepo.getActiveDraws(activeStatuses, 1),
      // Recent: 48h = 2 ngày
      this.drawRepo.getActiveDraws(recentStatuses, 2),
      // Scheduled: 7 ngày, sẽ lọc kỳ không nằm trong quá khứ quá 1 ngày
      this.drawRepo.getActiveDraws([DrawStatus.Scheduled], 1),
    ]);

    // Chỉ lấy scheduled có drawDate từ hôm nay trở đi (hoặc hôm qua để bắt kỳ chưa mở)
    const yesterdayStr = yesterdayVN();
    const futureOnly = scheduledDraws.filter((d) => d.drawDate >= yesterdayStr);

    const toItem = (d: DrawEntity, group: DrawSelectorItem["group"]): DrawSelectorItem => {
      const drawTimeDate = d.drawTime instanceof Date ? d.drawTime : new Date(d.drawTime as string);
      const drawDateFormatted = d.drawDate.split("-").reverse().join("/"); // YYYY-MM-DD → DD/MM/YYYY

      return {
        drawId: d.drawId,
        drawNo: d.drawNo as 1 | 2,
        drawDate: drawDateFormatted,
        drawTime: drawTimeDate.toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Ho_Chi_Minh",
        }),
        salesOpenAt: d.sales?.openAt instanceof Date ? d.sales.openAt.toISOString() : undefined,
        salesCloseAt:
          d.sales?.closeAt instanceof Date
            ? d.sales.closeAt.toISOString()
            : String(d.sales?.closeAt ?? ""),
        drawResultAt:
          d.result?.publishedAt instanceof Date
            ? d.result.publishedAt.toISOString()
            : drawTimeDate.toISOString(),
        settledAt: d.settledAt instanceof Date ? d.settledAt.toISOString() : undefined,
        resultPublishedAt:
          d.result?.publishedAt instanceof Date ? d.result.publishedAt.toISOString() : undefined,
        status: d.status,
        financialDate: d.financialDate ?? d.drawDate,
        group,
      };
    };

    const draws: DrawSelectorItem[] = [
      ...activeDraws.map((d) => toItem(d, "active")),
      ...futureOnly.map((d) => toItem(d, "future")),
      ...recentDraws.map((d) => toItem(d, "recent")),
    ];

    return { draws };
  }
}
