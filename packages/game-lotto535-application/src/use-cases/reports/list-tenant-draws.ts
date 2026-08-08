import { NextApiUseCase } from "@megawin/next/server";
import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListTenantDrawsInput, ListTenantDrawsOutput } from "./types";

/**
 * Danh sách draws của 1 tenant trong date range. Drill cấp 2 tab "Theo đại lý".
 *
 * Paginated, sort DESC theo financialDate.
 * Index: { tenantId: 1, financialDate: 1 }
 */
export class ListTenantDrawsUseCase extends NextApiUseCase<ListTenantDrawsInput, ListTenantDrawsOutput> {
  private readonly repo = new SettleTenantReportRepository();

  protected async execute(input: ListTenantDrawsInput): Promise<ListTenantDrawsOutput> {
    const skip = (input.page - 1) * input.limit;
    const { data, total } = await this.repo.findByTenantAndDateRange(input.tenantId, input.from, input.to, {
      skip,
      limit: input.limit,
    });
    return { data, total, page: input.page, limit: input.limit };
  }
}
