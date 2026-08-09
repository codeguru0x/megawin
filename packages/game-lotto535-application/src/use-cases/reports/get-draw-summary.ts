import { NextApiUseCase } from "@megawin/next/server";

import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import type { GetDrawSummaryInput, GetDrawSummaryOutput } from "./types";

/**
 * KPI summary tổng hợp cho tất cả draws trong date range.
 *
 * Trả 1 object tổng (drawCount, entryCount, totalStake, ggr...).
 * Dùng cho KPI strip tab "Theo kỳ quay" trong Financial Reports page.
 */
export class GetDrawSummaryUseCase extends NextApiUseCase<GetDrawSummaryInput, GetDrawSummaryOutput> {
  private readonly repo = new SettleDrawReportRepository();

  protected async execute(input: GetDrawSummaryInput): Promise<GetDrawSummaryOutput> {
    const data = await this.repo.aggregateSummary(input.from, input.to);
    return { data };
  }
}
