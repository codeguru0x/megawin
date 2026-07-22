import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus, DrawSelectorGroup } from "@megawin/game-core/entities";
import { sortBy, displayVNTime } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-power655/entities";
import type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

/**
 * Lấy danh sách kỳ quay cho draw selector dropdown trên dashboard vận hành Power 6/55.
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
 * Power 6/55: 3 kỳ/tuần (thứ 3, 5, 7), 1 kỳ/ngày (drawNo = 1 cố định).
 * Sorted theo drawDate asc (trong mỗi nhóm).
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
    // getRecentCompletedDraws trả về DESC — re-sort ASC để giữ thứ tự hiển thị cũ→mới.
    const recentSorted = sortBy(recentDraws, (d) => d.drawId);

    const toItem = (d: DrawEntity, group: DrawSelectorGroup): DrawSelectorItem => {
      // drawTime luôn là Date thật (DrawEntity.drawTime: Date, không optional) — không cần guard.
      const drawTimeDate = d.drawTime;
      const drawDateFormatted = d.drawDate.split("-").reverse().join("/");

      return {
        drawId: d.drawId,
        // Power 6/55: drawNo luôn = 1
        drawNo: 1,
        drawDate: drawDateFormatted,
        drawTime: displayVNTime(drawTimeDate),
        // d.sales luôn có (DrawSales bắt buộc); openAt optional, closeAt bắt buộc.
        salesOpenAt: d.sales.openAt?.toISOString(),
        salesCloseAt: d.sales.closeAt.toISOString(),
        drawResultAt: drawTimeDate.toISOString(),
        status: d.status,
        financialDate: d.financialDate ?? d.drawDate,
        group,
        // High-water mark — kỳ đã settle ít nhất 1 lần.
        settledAt: d.settledAt?.toISOString(),
        // publishedAt của result gần nhất — so sánh với settledAt để biết có result mới.
        resultPublishedAt: d.result?.publishedAt.toISOString(),
      };
    };

    const draws: DrawSelectorItem[] = [
      ...activeDraws.map((d) => toItem(d, DrawSelectorGroup.Active)),
      ...futureOnly.map((d) => toItem(d, DrawSelectorGroup.Future)),
      ...recentSorted.map((d) => toItem(d, DrawSelectorGroup.Recent)),
    ];

    return { draws };
  }
}
