import { NextApiUseCase } from "@megawin/next/server";
import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import type { GetDrawSummaryInput, GetDrawSummaryOutput } from "./types";

/**
 * Aggregate SUM tất cả draws trong date range — dùng cho KPI strip.
 *
 * Max 3D KHÔNG CÓ jackpotContribution — DrawSummaryResult không có field đó.
 */
export class GetDrawSummaryUseCase extends NextApiUseCase<GetDrawSummaryInput, GetDrawSummaryOutput> {
  private readonly repo = new SettleDrawReportRepository();

  protected async execute(input: GetDrawSummaryInput): Promise<GetDrawSummaryOutput> {
    const data = await this.repo.aggregateSummary({ from: input.from, to: input.to });
    return { data };
  }
}
