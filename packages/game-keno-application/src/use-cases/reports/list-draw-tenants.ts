import { UseCase } from "@megawin/app-core/use-cases";

import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListDrawTenantsInput, ListDrawTenantsOutput } from "./types";

/**
 * Lấy danh sách tenant reports của 1 draw — drill-down level 2.
 */
export class ListDrawTenantsUseCase extends UseCase<ListDrawTenantsInput, ListDrawTenantsOutput> {
  private readonly repo = new SettleTenantReportRepository();

  protected async execute(input: ListDrawTenantsInput): Promise<ListDrawTenantsOutput> {
    const data = await this.repo.findByDrawId(input.drawId);
    return { data };
  }
}
