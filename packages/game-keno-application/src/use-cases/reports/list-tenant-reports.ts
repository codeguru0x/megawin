import { NextApiUseCase } from "@megawin/next/server";

import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListTenantReportsInput, ListTenantReportsOutput } from "./types";

/**
 * Aggregate tenant summary trong date range — tab "Theo đại lý" level 1.
 *
 * Keno KHÔNG có lineCount.
 */
export class ListTenantReportsUseCase extends NextApiUseCase<ListTenantReportsInput, ListTenantReportsOutput> {
  private readonly repo = new SettleTenantReportRepository();

  protected async execute(input: ListTenantReportsInput): Promise<ListTenantReportsOutput> {
    const data = await this.repo.aggregateByTenant(input.from, input.to);
    return { data };
  }
}
