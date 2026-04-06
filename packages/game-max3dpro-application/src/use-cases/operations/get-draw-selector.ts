import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { yesterdayVN, formatVNDate, subDays } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-max3dpro/entities";
import type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

/**
 * Lấy danh sách kỳ quay cho draw selector dropdown trên dashboard vận hành Max 3D Pro.
 *
 * Trả về 3 nhóm:
 * - active: kỳ đang xử lý (salesOpen, salesClosed, published, settling, voiding)
 * - future: kỳ scheduled trong tương lai (chưa đến)
 * - recent: kỳ đã xong trong 48h qua (settled, void)
 *
 * Max 3D Pro quay T3/T5/T7 → mỗi tuần chỉ có 3 kỳ → danh sách ngắn, Select đơn giản đủ dùng.
 * Sorted theo drawDate asc trong mỗi nhóm.
 */
export class GetDrawSelectorUseCase extends NextApiUseCase<void, GetDrawSelectorOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(_input: void): Promise<GetDrawSelectorOutput> {
    const activeStatuses = [
      DrawStatus.SalesOpen,
      DrawStatus.SalesClosed,
      DrawStatus.Published,
      DrawStatus.Settling,
      DrawStatus.Voiding,
    ];

    const recentStatuses = [DrawStatus.Settled, DrawStatus.Void];

    const [activeDraws, recentDraws, scheduledDraws] = await Promise.all([
      // Active: salesOpen, salesClosed, published, settling, voiding
      this.drawRepo.getActiveDraws(activeStatuses),
      // Recent: settled hoặc void
      this.drawRepo.getActiveDraws(recentStatuses),
      // Scheduled: chưa mở bán
      this.drawRepo.getActiveDraws([DrawStatus.Scheduled]),
    ]);

    // Chỉ lấy scheduled có drawDate từ hôm qua trở đi (bắt kỳ chưa mở bán)
    const yesterdayStr = yesterdayVN();
    const futureOnly = scheduledDraws.filter((d) => d.drawDate >= yesterdayStr);

    // Chỉ lấy recent trong 48h qua
    const twoDaysAgoStr = formatVNDate(subDays(new Date(), 2));
    const recentOnly = recentDraws.filter((d) => d.drawDate >= twoDaysAgoStr);

    const toItem = (d: DrawEntity, group: DrawSelectorItem["group"]): DrawSelectorItem => {
      const drawTimeDate = d.drawTime instanceof Date ? d.drawTime : new Date(d.drawTime as string);
      // YYYY-MM-DD → DD/MM/YYYY
      const drawDateFormatted = d.drawDate.split("-").reverse().join("/");

      return {
        drawId: d.drawId,
        drawNo: d.drawNo,
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
        drawResultAt: drawTimeDate.toISOString(),
        status: d.status,
        financialDate: d.financialDate ?? d.drawDate,
        group,
      };
    };

    const draws: DrawSelectorItem[] = [
      ...activeDraws.map((d) => toItem(d, "active")),
      ...futureOnly.map((d) => toItem(d, "future")),
      ...recentOnly.map((d) => toItem(d, "recent")),
    ];

    return { draws };
  }
}
