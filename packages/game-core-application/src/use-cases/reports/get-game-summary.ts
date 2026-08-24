import { UseCase } from "@megawin/app-core/use-cases";

import { SystemSettleGameDailyRepository } from "../../infras/repos/system-settle-game-daily-repo";
import type { GetGameSummaryInput, GetGameSummaryOutput } from "./types";

/**
 * Tổng hợp tài chính hệ thống theo từng game trong date range.
 *
 * Kết quả dùng cho tab "Theo game" trang System Financial Reports.
 * Mỗi row = 1 game, đã tổng hợp toàn bộ draws trong range.
 *
 * `input.game` (tuỳ chọn) giới hạn còn 1 game — dùng khi câu hỏi chỉ về một game, để không phải
 * trả 7 dòng rồi bắt phía gọi tự lọc (lọc phía sau là chỗ sinh lỗi: xem sự cố biểu đồ 24/08 ở
 * `apps/backoffice/agent/tools/renderChart.ts`). Cần chuỗi THỜI GIAN của 1 game thì dùng
 * `GetGamePeriodTrendUseCase`.
 */
export class GetGameSummaryUseCase extends UseCase<GetGameSummaryInput, GetGameSummaryOutput> {
  private readonly repo = new SystemSettleGameDailyRepository();

  protected async execute(input: GetGameSummaryInput): Promise<GetGameSummaryOutput> {
    const data = await this.repo.aggregateByGameProduct(input.from, input.to, input.game);
    return { data };
  }
}
