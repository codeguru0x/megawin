import { UseCase } from "@megawin/app-core/use-cases";
import type { GameProduct } from "@megawin/game-core/entities";
import { getGameLabel } from "@megawin/game-core/labels";

import { SystemSettleGameDailyRepository } from "../../infras/repos/system-settle-game-daily-repo";
import type { GetGamePeriodTrendInput, GetGamePeriodTrendOutput } from "./types";

/**
 * Chuỗi thời gian tài chính đã chốt — 1 dòng = 1 kỳ (ngày/tuần/tháng), lọc được 1 game.
 *
 * Bù đúng khoảng trống giữa hai báo cáo cũ: `GetGameSummaryUseCase` gộp cả khoảng thành 1 dòng
 * mỗi game (không có trục thời gian), `GetDailyOverviewUseCase` có trục thời gian nhưng gộp toàn
 * bộ game và chỉ chia theo ngày. Câu hỏi "doanh thu Keno 6 tháng đầu năm" không rơi vào cái nào
 * — trước đây phải gọi báo cáo 6 lần rồi tự ghép, và biểu đồ (dựng từ MỘT lần gọi) vẽ sai dữ
 * liệu mà không báo lỗi (sự cố 24/08, xem `apps/backoffice/agent/tools/renderChart.ts`).
 *
 * `meta` echo lại tham số: dòng dữ liệu chỉ có khoá kỳ (`"2026-06"`) nên nếu không nói rõ độ chia
 * + game đang lọc thì người đọc (và model) không phân biệt được "tháng 6 của Keno" với "tháng 6
 * của toàn hệ thống".
 */
export class GetGamePeriodTrendUseCase extends UseCase<GetGamePeriodTrendInput, GetGamePeriodTrendOutput> {
  private readonly repo = new SystemSettleGameDailyRepository();

  protected async execute(input: GetGamePeriodTrendInput): Promise<GetGamePeriodTrendOutput> {
    const data = await this.repo.aggregateByPeriod(input);
    return {
      data,
      meta: {
        period: input.period,
        from: input.from,
        to: input.to,
        ...(input.game === undefined ? {} : { game: input.game, gameLabel: getGameLabel(input.game as GameProduct) }),
      },
    };
  }
}
