import { UseCase } from "@megawin/app-core/use-cases";

import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListTenantDrawsInput, ListTenantDrawsOutput } from "./types";

/**
 * Lấy danh sách draws của 1 tenant trong date range — drill-down level 3.
 */
export class ListTenantDrawsUseCase extends UseCase<ListTenantDrawsInput, ListTenantDrawsOutput> {
  private readonly repo = new SettleTenantReportRepository();

  protected async execute(input: ListTenantDrawsInput): Promise<ListTenantDrawsOutput> {
    const { data, total } = await this.repo.findByTenantAndDateRange(input.tenantId, input.from, input.to);
    return { data, total };
  }
}
