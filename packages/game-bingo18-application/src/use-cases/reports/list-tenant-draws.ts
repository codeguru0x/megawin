import { NextApiUseCase } from "@megawin/next/server";
import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListTenantDrawsInput, ListTenantDrawsOutput } from "./types";

export class ListTenantDrawsUseCase extends NextApiUseCase<ListTenantDrawsInput, ListTenantDrawsOutput> {
  private readonly repo = new SettleTenantReportRepository();
  protected async execute(input: ListTenantDrawsInput): Promise<ListTenantDrawsOutput> {
    const { data, total } = await this.repo.findByTenantAndDateRange(input.tenantId, input.from, input.to);
    return { data, total };
  }
}
