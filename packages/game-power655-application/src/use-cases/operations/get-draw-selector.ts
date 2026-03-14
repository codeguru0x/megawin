import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-power655/entities";
import type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

/**
 * Lấy danh sách kỳ quay cho draw selector dropdown trên dashboard vận hành Power 6/55.
 *
 * Trả về 3 nhóm:
 * - active: kỳ đang xử lý (salesOpen, salesClosed, published, settling, voiding)
 * - future: kỳ scheduled (chưa đến)
 * - recent: kỳ đã xong trong 48h qua (settled, void)
 *
 * Power 6/55: 3 kỳ/tuần (thứ 3, 5, 7), 1 kỳ/ngày (drawNo = 1 cố định).
 * Sorted theo drawDate asc (trong mỗi nhóm).
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
      this.drawRepo.getActiveDraws(activeStatuses),
      this.drawRepo.getActiveDraws(recentStatuses),
      this.drawRepo.getActiveDraws([DrawStatus.Scheduled]),
    ]);

    // Chỉ lấy scheduled từ hôm qua trở đi
    const yesterdayStr = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().substring(0, 10);
    })();
    const futureOnly = scheduledDraws.filter((d) => d.drawDate >= yesterdayStr);

    const toItem = (d: DrawEntity, group: DrawSelectorItem["group"]): DrawSelectorItem => {
      const drawTimeDate = d.drawTime instanceof Date ? d.drawTime : new Date(d.drawTime as string);
      const drawDateFormatted = d.drawDate.split("-").reverse().join("/");

      return {
        drawId: d.drawId,
        // Power 6/55: drawNo luôn = 1
        drawNo: 1,
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
      ...recentDraws.map((d) => toItem(d, "recent")),
    ];

    return { draws };
  }
}
