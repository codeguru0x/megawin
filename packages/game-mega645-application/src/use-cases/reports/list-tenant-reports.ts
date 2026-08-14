import { UseCase } from "@megawin/app-core/use-cases";

import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListTenantReportsInput, ListTenantReportsOutput } from "./types";

/** Aggregate tenant reports. Tab "Theo đại lý" cấp 1. */
export class ListTenantReportsUseCase extends UseCase<ListTenantReportsInput, ListTenantReportsOutput> {
  private readonly repo = new SettleTenantReportRepository();
  protected async execute(input: ListTenantReportsInput): Promise<ListTenantReportsOutput> {
    return { data: await this.repo.aggregateByTenant(input.from, input.to) };
  }
}
