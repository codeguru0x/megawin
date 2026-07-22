import { NextApiUseCase } from "@megawin/next/server";
import { DrawStatus, DrawSelectorGroup } from "@megawin/game-core/entities";
import { sortBy, displayVNTime } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawEntity } from "@megawin/game-lotto535/entities";
import type { GetDrawSelectorOutput, DrawSelectorItem } from "./dto/draw-selector.dto";

/**
 * Lấy danh sách kỳ quay cho draw selector dropdown trên dashboard vận hành.
 *
 * Trả về 3 nhóm:
 * - active: mọi kỳ unfinished KHÔNG phải Scheduled (salesOpen, salesClosed, published, settling,
 *   voiding) — đã bắt đầu vận hành, cần staff theo dõi/xử lý tiếp bước kế.
 * - future: kỳ Scheduled — chưa mở bán. Việc mở bán do staff bấm tay (không có cron tự động),
 *   nên phân nhóm thuần theo status, KHÔNG dựa vào drawDate: staff toàn quyền quyết định thời
 *   điểm xử lý, kỳ Scheduled dù cũ bao lâu vẫn thuộc "future" cho tới khi được mở bán.
 * - recent: 5 kỳ đã hoàn thành gần nhất (settled, void).
 *
 * Nhóm active/future lấy từ `getUnfinishedDraws()` — KHÔNG lookback theo ngày, nên không sót kỳ
 * nào. Đây là single source of truth "kỳ đang vận hành", đồng bộ với `GetCurrentDrawUseCase`
 * (trang Lịch sử kỳ quay).
 *
 * Nhóm recent lấy theo SỐ PHIÊN (không lookback ngày) — đồng nhất cách tính với mọi game khác,
 * xem `getRecentCompletedDraws`.
 *
 * Sorted theo drawDate + drawNo asc (trong mỗi nhóm).
 */
export class GetDrawSelectorUseCase extends NextApiUseCase<void, GetDrawSelectorOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(_input: void): Promise<GetDrawSelectorOutput> {
    const [unfinishedDraws, recentDraws] = await Promise.all([
      // Active + future: TẤT CẢ kỳ chưa hoàn thành, không lookback theo ngày.
      this.drawRepo.getUnfinishedDraws(),
      // Recent: 5 kỳ settled/void gần nhất.
      this.drawRepo.getRecentCompletedDraws(5),
    ]);

    // Phân loại lại tập unfinished thuần theo status — KHÔNG dựa vào drawDate: mở bán do staff
    // bấm tay (không có cron tự động), nên 1 kỳ Scheduled dù cũ bao lâu vẫn là "future" tới khi
    // staff xử lý, không tự suy diễn "quá hạn = cần xử lý".
    // getUnfinishedDraws() trả về sort drawId DESC (khớp index) — re-sort ASC ở đây vì tập
    // unfinished luôn nhỏ (vài chục kỳ), chi phí không đáng kể, giữ nguyên UX cũ→mới.
    const activeDraws = sortBy(
      unfinishedDraws.filter((d) => d.status !== DrawStatus.Scheduled),
      (d) => d.drawId,
    );
    const futureOnly = sortBy(
      unfinishedDraws.filter((d) => d.status === DrawStatus.Scheduled),
      (d) => d.drawId,
    );
    // getRecentCompletedDraws trả về DESC (drawId:-1, mới nhất trước) — re-sort ASC để khớp
    // thứ tự hiển thị cũ→mới của 2 nhóm active/future.
    const recentSorted = sortBy(recentDraws, (d) => d.drawId);

    const toItem = (d: DrawEntity, group: DrawSelectorGroup): DrawSelectorItem => {
      // drawTime luôn là Date thật (DrawEntity.drawTime: Date, không optional) — không cần guard.
      const drawTimeDate = d.drawTime;
      const drawDateFormatted = d.drawDate.split("-").reverse().join("/"); // YYYY-MM-DD → DD/MM/YYYY

      return {
        drawId: d.drawId,
        drawNo: d.drawNo as 1 | 2,
        drawDate: drawDateFormatted,
        drawTime: displayVNTime(drawTimeDate),
        // d.sales luôn có (DrawSales bắt buộc); openAt optional, closeAt bắt buộc.
        salesOpenAt: d.sales.openAt?.toISOString(),
        salesCloseAt: d.sales.closeAt.toISOString(),
        // d.result optional (chưa publish); publishedAt bắt buộc bên trong result khi đã có.
        drawResultAt: d.result?.publishedAt.toISOString() ?? drawTimeDate.toISOString(),
        settledAt: d.settledAt?.toISOString(),
        resultPublishedAt: d.result?.publishedAt.toISOString(),
        status: d.status,
        financialDate: d.financialDate ?? d.drawDate,
        group,
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
