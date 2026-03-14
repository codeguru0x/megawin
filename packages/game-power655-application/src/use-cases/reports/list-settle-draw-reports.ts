import { NextApiUseCase } from "@megawin/next/server";
import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import type { ListSettleDrawReportsInput, ListSettleDrawReportsOutput } from "./types";

/**
 * Danh sách kỳ quay đã settle trong date range. Paginated, sort DESC.
 *
 * Dùng cho tab "Theo kỳ quay" cấp 1 trong Financial Reports page.
 * Index: { financialDate: 1 }
 */
export class ListSettleDrawReportsUseCase extends NextApiUseCase<
  ListSettleDrawReportsInput,
  ListSettleDrawReportsOutput
> {
  private readonly repo = new SettleDrawReportRepository();

  protected async execute(input: ListSettleDrawReportsInput): Promise<ListSettleDrawReportsOutput> {
    const skip = (input.page - 1) * input.limit;
    const { data, total } = await this.repo.findByDateRange(input.from, input.to, {
      skip,
      limit: input.limit,
    });
    return { data, total, page: input.page, limit: input.limit };
  }
}
