import { UseCase } from "@megawin/app-core/use-cases";
import type { GameProduct } from "@megawin/game-core/entities";
import { getGameLabel, REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";

import { SystemSettleGameDailyRepository } from "../../infras/repos/system-settle-game-daily-repo";
import type { GetGamePeriodTrendByGameInput, GetGamePeriodTrendByGameOutput } from "./types";

/**
 * So sánh NHIỀU game trên CÙNG 1 chỉ số theo thời gian — 1 dòng = 1 kỳ, mỗi game 1 cột số riêng.
 *
 * Bù khoảng trống của `GetGamePeriodTrendUseCase` (chỉ lọc được ĐÚNG 1 game/lần gọi): câu hỏi "so
 * sánh doanh thu thuần Keno và Power 6/55 theo tháng" trước đây phải gọi tool theo kỳ N lần (mỗi
 * game 1 lần) rồi KHÔNG thể vẽ chung 1 chart, vì `renderChart` chế độ đọc-tool-trước chỉ đọc được
 * MỘT lần gọi gần nhất (sự cố 24/08, xem `apps/backoffice/agent/tools/renderChart.ts`) — biến thể
 * "nhiều game" của đúng lỗi đã vá cho "nhiều tháng".
 *
 * `meta.gameLabels`/`metricLabel` echo tên hiển thị: dòng dữ liệu chỉ có raw `gameProduct` id làm
 * khoá cột (`"keno"`, `"power655"`) — người đọc/model cần biết khoá đó ứng với game nào và đơn vị
 * chỉ số nào (VND, %, số lượng...).
 */
export class GetGamePeriodTrendByGameUseCase extends UseCase<
  GetGamePeriodTrendByGameInput,
  GetGamePeriodTrendByGameOutput
> {
  private readonly repo = new SystemSettleGameDailyRepository();

  protected async execute(input: GetGamePeriodTrendByGameInput): Promise<GetGamePeriodTrendByGameOutput> {
    const data = await this.repo.aggregateByPeriodPerGame(input);
    return {
      data,
      meta: {
        period: input.period,
        games: input.games,
        gameLabels: input.games.map((g) => getGameLabel(g as GameProduct)),
        metric: input.metric,
        metricLabel: REPORT_COLUMN_LABELS[input.metric],
        from: input.from,
        to: input.to,
      },
    };
  }
}
