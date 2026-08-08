import { NextApiUseCase } from "@megawin/next/server";

import { SystemSettleGameDailyRepository } from "../../infras/repos/system-settle-game-daily-repo";
import type { GetDashboardKpisInput, GetDashboardKpisOutput } from "./types";

/**
 * Lấy per-game settle data cho dashboard KPIs + Game Performance.
 *
 * Trả về raw docs cho 1-2 ngày tài chính (fd + optional compare).
 * 1 query duy nhất với $in filter phục vụ 5 zones:
 *   Hero KPIs, Game Table, Game Mix (Donut), Payout Ratio, Trend %.
 * Client-side compute totals và trend % từ kết quả trả về.
 *
 * Index: { financialDate: 1, gameProduct: 1 }
 */
export class GetDashboardKpisUseCase extends NextApiUseCase<GetDashboardKpisInput, GetDashboardKpisOutput> {
  private readonly repo = new SystemSettleGameDailyRepository();

  protected async execute(input: GetDashboardKpisInput): Promise<GetDashboardKpisOutput> {
    // Gộp fd + compare dates vào 1 query $in để tối thiểu DB round-trip.
    // compare là comma-separated: "2026-03-22,2026-03-15" → split ra array.
    const dates = [input.fd];
    if (input.compare) {
      dates.push(...input.compare.split(",").filter(Boolean));
    }

    const data = await this.repo.findByFinancialDates(dates);
    return { data };
  }
}
