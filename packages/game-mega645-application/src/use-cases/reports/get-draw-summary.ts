import { UseCase } from "@megawin/app-core/use-cases";

import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import type { GetDrawSummaryInput, GetDrawSummaryOutput } from "./types";

/** KPI summary tổng hợp cho tất cả draws trong date range. */
export class GetDrawSummaryUseCase extends UseCase<GetDrawSummaryInput, GetDrawSummaryOutput> {
  private readonly repo = new SettleDrawReportRepository();
  protected async execute(input: GetDrawSummaryInput): Promise<GetDrawSummaryOutput> {
    return { data: await this.repo.aggregateSummary(input.from, input.to) };
  }
}
