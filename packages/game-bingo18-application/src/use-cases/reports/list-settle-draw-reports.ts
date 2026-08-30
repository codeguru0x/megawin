import { UseCase } from "@megawin/app-core/use-cases";

import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import type { ListSettleDrawReportsInput, ListSettleDrawReportsOutput } from "./types";

/** Lấy danh sách settle draw reports. Bingo 18 ~158 kỳ/ngày — pagination BẮT BUỘC. */
export class ListSettleDrawReportsUseCase extends UseCase<ListSettleDrawReportsInput, ListSettleDrawReportsOutput> {
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
