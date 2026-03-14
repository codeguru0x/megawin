import { NextApiUseCase } from "@megawin/next/server";
import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import type { ListSettleDrawReportsInput, ListSettleDrawReportsOutput } from "./types";

/**
 * Danh sách kỳ quay đã settle trong date range. Paginated, sort DESC.
 *
 * Dùng cho tab "Theo Kỳ Quay" cấp 1 trong Financial Reports page.
 * Max 3D: ~60 kỳ/tháng — pagination quan trọng.
 */
export class ListSettleDrawReportsUseCase extends NextApiUseCase<
  ListSettleDrawReportsInput,
  ListSettleDrawReportsOutput
> {
  private readonly repo = new SettleDrawReportRepository();

  protected async execute(input: ListSettleDrawReportsInput): Promise<ListSettleDrawReportsOutput> {
    const { data, total } = await this.repo.findByDateRange({
      from: input.from,
      to: input.to,
      page: input.page,
      limit: input.limit,
    });
    return { data, total, page: input.page, limit: input.limit };
  }
}
