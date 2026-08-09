import { NextApiUseCase } from "@megawin/next/server";

import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListTenantReportsInput, ListTenantReportsOutput } from "./types";

/**
 * Tổng hợp tài chính theo tenant trong date range. Cấp 1 tab "Theo đại lý".
 *
 * Mỗi row = 1 tenant, aggregate từ tất cả draws trong range.
 * Sắp xếp theo totalStake DESC.
 * Index: { financialDate: 1, tenantId: 1 }
 */
export class ListTenantReportsUseCase extends NextApiUseCase<ListTenantReportsInput, ListTenantReportsOutput> {
  private readonly repo = new SettleTenantReportRepository();

  protected async execute(input: ListTenantReportsInput): Promise<ListTenantReportsOutput> {
    const data = await this.repo.aggregateByTenant(input.from, input.to);
    return { data };
  }
}
