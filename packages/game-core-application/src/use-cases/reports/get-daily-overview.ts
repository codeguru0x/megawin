import { NextApiUseCase } from "@megawin/next/server";
import { SystemSettleGameDailyRepository } from "../../infras/repos/system-settle-game-daily-repo";
import type { GetDailyOverviewInput, GetDailyOverviewOutput } from "./types";

/**
 * Tổng quan tài chính hệ thống theo ngày tài chính.
 *
 * 2 chế độ:
 *   - date có → trả raw docs cho ngày đó (inline game breakdown).
 *   - date không có → aggregate rows tổng hợp theo từng ngày trong range.
 *
 * Dùng cho tab "Tổng quan ngày" trang System Financial Reports.
 */
export class GetDailyOverviewUseCase
  extends NextApiUseCase<GetDailyOverviewInput, GetDailyOverviewOutput>
{
  private readonly repo = new SystemSettleGameDailyRepository();

  protected async execute(input: GetDailyOverviewInput): Promise<GetDailyOverviewOutput> {
    if (input.date) {
      // Inline expand: raw docs cho 1 ngày cụ thể
      const data = await this.repo.findByFinancialDate(input.date);
      return { data };
    }

    // Aggregate tổng hợp theo từng ngày trong range
    const data = await this.repo.aggregateByFinancialDate(input.from, input.to);
    return { data };
  }
}
