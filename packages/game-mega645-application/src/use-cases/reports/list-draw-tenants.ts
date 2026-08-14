import { UseCase } from "@megawin/app-core/use-cases";

import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListDrawTenantsInput, ListDrawTenantsOutput } from "./types";

/** Danh sách tenant reports cho 1 draw. Drill cấp 2. */
export class ListDrawTenantsUseCase extends UseCase<ListDrawTenantsInput, ListDrawTenantsOutput> {
  private readonly repo = new SettleTenantReportRepository();
  protected async execute(input: ListDrawTenantsInput): Promise<ListDrawTenantsOutput> {
    return { data: await this.repo.findByDrawId(input.drawId) };
  }
}
