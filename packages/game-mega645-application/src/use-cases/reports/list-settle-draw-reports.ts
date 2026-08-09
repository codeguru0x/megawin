import { NextApiUseCase } from "@megawin/next/server";

import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import type { ListSettleDrawReportsInput, ListSettleDrawReportsOutput } from "./types";

/** Danh sách kỳ quay đã settle trong date range. Paginated. Index: { financialDate: 1 } */
export class ListSettleDrawReportsUseCase extends NextApiUseCase<
  ListSettleDrawReportsInput,
  ListSettleDrawReportsOutput
> {
  private readonly repo = new SettleDrawReportRepository();
  protected async execute(input: ListSettleDrawReportsInput): Promise<ListSettleDrawReportsOutput> {
    const { data, total } = await this.repo.findByDateRange(input.from, input.to, {
      skip: (input.page - 1) * input.limit,
      limit: input.limit,
    });
    return { data, total, page: input.page, limit: input.limit };
  }
}
