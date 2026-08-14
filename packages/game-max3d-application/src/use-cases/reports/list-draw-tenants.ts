import { UseCase } from "@megawin/app-core/use-cases";

import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListDrawTenantsInput, ListDrawTenantsOutput } from "./types";

/**
 * List tenant reports cho 1 draw đã settle — drill-down cấp 2 tab "Theo Kỳ Quay".
 *
 * Sort: commission desc (tenant doanh thu lớn lên trên).
 */
export class ListDrawTenantsUseCase extends UseCase<ListDrawTenantsInput, ListDrawTenantsOutput> {
  private readonly repo = new SettleTenantReportRepository();

  protected async execute(input: ListDrawTenantsInput): Promise<ListDrawTenantsOutput> {
    const data = await this.repo.findByDrawId(input.drawId);
    return { data };
  }
}
