import { UseCase } from "@megawin/app-core/use-cases";

import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import type { GetDrawSummaryInput, GetDrawSummaryOutput } from "./types";

/**
 * Aggregate KPI summary cho tất cả draws trong date range.
 *
 * Keno KHÔNG có lineCount, jackpotContribution.
 */
export class GetDrawSummaryUseCase extends UseCase<GetDrawSummaryInput, GetDrawSummaryOutput> {
  private readonly repo = new SettleDrawReportRepository();

  protected async execute(input: GetDrawSummaryInput): Promise<GetDrawSummaryOutput> {
    const data = await this.repo.aggregateSummary(input.from, input.to);
    return { data };
  }
}
