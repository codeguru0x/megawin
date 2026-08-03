import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus, DrawSelectorGroup } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { displayVNTime, sortBy } from "@megawin/shared/utils";
import type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

/**
 * Dropdown chọn kỳ quay cho Keno Operations Dashboard.
 *
 * Keno có ~120 kỳ/ngày — group theo trạng thái để tránh quá tải:
 *   - active: unfinished còn lại (salesOpen/salesClosed/published/settling/voiding, và cả
 *     scheduled đã tới hạn/quá khứ — coi như cần xử lý). Sort drawId ASC — kỳ SỚM nhất lên đầu.
 *   - future: scheduled sắp tới, chỉ lấy 10 kỳ gần nhất (sort drawTime asc).
 *   - recent: 5 kỳ settled/void gần đây nhất (sort drawId desc — mới nhất lên đầu, dễ theo dõi).
 *
 * `active` + `future` cùng lấy từ 1 query `getUnfinishedDraws()` (KHÔNG lookback ngày) rồi
 * phân loại in-memory — tránh bỏ sót kỳ kẹt cũ dù trễ bao lâu.
 * `recent` lấy theo SỐ PHIÊN (không lookback ngày) — xem `getRecentCompletedDraws`.
 *
 * DrawId format: "YYYY-MM-DD.NNN".
 */
export class GetDrawSelectorUseCase extends NextApiUseCase<void, GetDrawSelectorOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(): Promise<GetDrawSelectorOutput> {
    const [unfinishedDraws, recentDraws] = await Promise.all([
      this.drawRepo.getUnfinishedDraws(),
      this.drawRepo.getRecentCompletedDraws(5),
    ]);

    const futureDraws = sortBy(
      unfinishedDraws.filter((d) => d.status === DrawStatus.Scheduled),
      (d) => d.drawId,
    ).slice(0, 10);
    // active sort drawId ASC: kỳ SỚM nhất (gần giờ hiện tại nhất, cần xử lý trước) lên đầu.
    // getUnfinishedDraws trả DESC → phải re-sort, nếu không auto-select + selector hiện kỳ
    // XA nhất trước (vd 16:00 thay vì 14:48 đang chạy) — sai kỳ vận hành thực tế.
    const activeDraws = sortBy(
      unfinishedDraws.filter((d) => d.status !== DrawStatus.Scheduled),
      (d) => d.drawId,
    );

    const toItem = (
      draw: (typeof unfinishedDraws)[0],
      group: DrawSelectorGroup,
    ): DrawSelectorItem => ({
      drawId: draw.drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      drawTime: displayVNTime(draw.drawTime),
      salesCloseAt: draw.sales.closeAt.toISOString(),
      salesOpenAt: draw.sales.openAt?.toISOString(),
      // drawTime luôn có — giờ quay theo lịch, dùng để pre-fill form sửa lịch
      scheduledDrawAt: draw.drawTime.toISOString(),
      drawResultAt: draw.result?.publishedAt?.toISOString(),
      settledAt: draw.settledAt?.toISOString(),
      status: draw.status,
      financialDate: draw.financialDate,
      group,
    });

    const draws: DrawSelectorItem[] = [
      ...activeDraws.map((d) => toItem(d, DrawSelectorGroup.Active)),
      ...futureDraws.map((d) => toItem(d, DrawSelectorGroup.Future)),
      // getRecentCompletedDraws đã trả về DESC (drawId:-1, mới nhất trước) — dùng thẳng, KHÔNG
      // re-sort ASC như active/future: "vừa hoàn thành" nên hiện kỳ mới nhất lên đầu, dễ theo dõi.
      ...recentDraws.map((d) => toItem(d, DrawSelectorGroup.Recent)),
    ];

    return { draws };
  }
}
