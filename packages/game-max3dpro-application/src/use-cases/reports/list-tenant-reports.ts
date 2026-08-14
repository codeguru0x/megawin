import { UseCase } from "@megawin/app-core/use-cases";

import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListTenantReportsInput, ListTenantReportsOutput } from "./types";

/**
 * Aggregate theo tenant trong date range — dùng cho tab "Theo Đại Lý" cấp 1.
 */
export class ListTenantReportsUseCase extends UseCase<ListTenantReportsInput, ListTenantReportsOutput> {
  private readonly repo = new SettleTenantReportRepository();

  protected async execute(input: ListTenantReportsInput): Promise<ListTenantReportsOutput> {
    const data = await this.repo.aggregateByTenant({ from: input.from, to: input.to });
    return { data };
  }
}
