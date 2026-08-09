import { DrawSelectorGroup, DrawStatus } from "@megawin/game-core/entities";
import type { DrawEntity } from "@megawin/game-max3dpro/entities";
import { NextApiUseCase } from "@megawin/next/server";
import { displayVNTime, sortBy } from "@megawin/shared/utils";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawSelectorItem, GetDrawSelectorOutput } from "./dto/draw-selector.dto";

/**
 * Lấy danh sách kỳ quay cho draw selector dropdown trên dashboard vận hành Max 3D Pro.
 *
 * Trả về 3 nhóm:
 * - active: mọi kỳ unfinished KHÔNG phải Scheduled (salesOpen, salesClosed, published, settling,
 *   voiding) — đã bắt đầu vận hành, cần staff theo dõi/xử lý tiếp bước kế.
 * - future: kỳ Scheduled — chưa mở bán. Mở bán do staff bấm tay (không có cron tự động), nên phân
 *   nhóm thuần theo status, KHÔNG dựa vào drawDate: kỳ Scheduled dù cũ bao lâu vẫn thuộc "future"
 *   cho tới khi được mở bán.
 * - recent: 5 kỳ đã hoàn thành gần nhất (settled, void).
 *
 * Nhóm active/future lấy từ `getUnfinishedDraws()` — KHÔNG lookback theo ngày, không sót kỳ nào.
 * Nhóm recent lấy theo SỐ PHIÊN (không lookback ngày) — xem `getRecentCompletedDraws`.
 * Max 3D Pro quay T3/T5/T7 → mỗi tuần chỉ có 3 kỳ → danh sách ngắn, Select đơn giản đủ dùng.
 * Sorted: active/future theo drawDate ASC (cũ→mới). recent theo drawDate DESC (mới→cũ) — kỳ
 * vừa hoàn thành gần nhất lên đầu, dễ theo dõi.
 */
export class GetDrawSelectorUseCase extends NextApiUseCase<void, GetDrawSelectorOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(_input: void): Promise<GetDrawSelectorOutput> {
    const [unfinishedDraws, recentDraws] = await Promise.all([
      this.drawRepo.getUnfinishedDraws(),
      this.drawRepo.getRecentCompletedDraws(5),
    ]);

    // Phân loại lại tập unfinished thuần theo status — KHÔNG dựa vào drawDate. Re-sort ASC vì
    // getUnfinishedDraws trả DESC.
    const activeDraws = sortBy(
      unfinishedDraws.filter((d) => d.status !== DrawStatus.Scheduled),
      (d) => d.drawId,
    );
    const futureOnly = sortBy(
      unfinishedDraws.filter((d) => d.status === DrawStatus.Scheduled),
      (d) => d.drawId,
    );

    const toItem = (d: DrawEntity, group: DrawSelectorGroup): DrawSelectorItem => {
      // drawTime luôn là Date thật (DrawEntity.drawTime: Date, không optional) — không cần guard.
      const drawTimeDate = d.drawTime;
      // YYYY-MM-DD → DD/MM/YYYY
      const drawDateFormatted = d.drawDate.split("-").reverse().join("/");

      return {
        drawId: d.drawId,
        drawNo: d.drawNo,
        drawDate: drawDateFormatted,
        drawTime: displayVNTime(drawTimeDate),
        // d.sales luôn có (DrawSales bắt buộc); openAt optional, closeAt bắt buộc.
        salesOpenAt: d.sales.openAt?.toISOString(),
        salesCloseAt: d.sales.closeAt.toISOString(),
        // drawTime luôn có — giờ quay theo lịch, dùng cho countdown/overdue-publish.
        scheduledDrawAt: drawTimeDate.toISOString(),
        drawResultAt: d.result?.publishedAt.toISOString(),
        status: d.status,
        settledAt: d.settledAt?.toISOString(),
        financialDate: d.financialDate ?? d.drawDate,
        group,
      };
    };

    const draws: DrawSelectorItem[] = [
      ...activeDraws.map((d) => toItem(d, DrawSelectorGroup.Active)),
      ...futureOnly.map((d) => toItem(d, DrawSelectorGroup.Future)),
      // getRecentCompletedDraws đã trả về DESC (drawId:-1, mới nhất trước) — dùng thẳng, KHÔNG
      // re-sort ASC như active/future: "vừa hoàn thành" nên hiện kỳ mới nhất lên đầu để staff
      // không phải kéo xuống cuối danh sách mới thấy kỳ vừa xong.
      ...recentDraws.map((d) => toItem(d, DrawSelectorGroup.Recent)),
    ];

    return { draws };
  }
}
