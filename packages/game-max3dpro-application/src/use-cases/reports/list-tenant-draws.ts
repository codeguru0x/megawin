import { UseCase } from "@megawin/app-core/use-cases";

import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListTenantDrawsInput, ListTenantDrawsOutput } from "./types";

/**
 * List draws của 1 tenant trong date range — drill-down cấp 2 tab "Theo Đại Lý".
 */
export class ListTenantDrawsUseCase extends UseCase<ListTenantDrawsInput, ListTenantDrawsOutput> {
  private readonly repo = new SettleTenantReportRepository();

  protected async execute(input: ListTenantDrawsInput): Promise<ListTenantDrawsOutput> {
    const { data, total } = await this.repo.findByTenantAndDateRange({
      tenantId: input.tenantId,
      from: input.from,
      to: input.to,
      page: input.page,
      limit: input.limit,
    });
    return { data, total, page: input.page, limit: input.limit };
  }
}
