import { NextApiUseCase } from "@megawin/next/server";

import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import type { ListSettleDrawReportsInput, ListSettleDrawReportsOutput } from "./types";

/**
 * Lấy danh sách settle draw reports theo khoảng ngày tài chính.
 *
 * Keno ~120 kỳ/ngày — pagination BẮT BUỘC, default limit 20.
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
