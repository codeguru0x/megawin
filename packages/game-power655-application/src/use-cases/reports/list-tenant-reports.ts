import { NextApiUseCase } from "@megawin/next/server";
import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListTenantReportsInput, ListTenantReportsOutput } from "./types";

/**
 * Aggregate tenant reports cho tất cả draws trong date range. Tab "Theo đại lý" cấp 1.
 *
 * Group by tenantId → SUM tất cả draws.
 * Index: { financialDate: 1, tenantId: 1 }
 */
export class ListTenantReportsUseCase extends NextApiUseCase<ListTenantReportsInput, ListTenantReportsOutput> {
  private readonly repo = new SettleTenantReportRepository();

  protected async execute(input: ListTenantReportsInput): Promise<ListTenantReportsOutput> {
    const data = await this.repo.aggregateByTenant(input.from, input.to);
    return { data };
  }
}
