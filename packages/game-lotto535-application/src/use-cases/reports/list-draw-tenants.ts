import { UseCase } from "@megawin/app-core/use-cases";

import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { ListDrawTenantsInput, ListDrawTenantsOutput } from "./types";

/**
 * Danh sách tenant reports cho 1 draw cụ thể. Drill cấp 2 tab "Theo kỳ quay".
 *
 * Mỗi row = 1 tenant × 1 draw với metrics tài chính đầy đủ.
 * Index: { drawId: 1 }
 */
export class ListDrawTenantsUseCase extends UseCase<ListDrawTenantsInput, ListDrawTenantsOutput> {
  private readonly repo = new SettleTenantReportRepository();

  protected async execute(input: ListDrawTenantsInput): Promise<ListDrawTenantsOutput> {
    const data = await this.repo.findByDrawId(input.drawId);
    return { data };
  }
}
