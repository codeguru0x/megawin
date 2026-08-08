import { NextApiUseCase } from "@megawin/next/server";
import { EntryOutstandingRepository } from "../../infras/repos/entry-outstanding-repo";
import type { ListOutstandingTenantPlayersInput, ListOutstandingTenantPlayersOutput } from "./types";

/**
 * Aggregate player breakdown cho 1 draw × 1 tenant outstanding. Drill cấp 3.
 *
 * Group by accountId, lấy username từ doc đầu tiên.
 * Chỉ filter status = "scheduled".
 * Index: { drawId: 1, tenantId: 1, accountId: 1 }
 */
export class ListOutstandingTenantPlayersUseCase extends NextApiUseCase<
  ListOutstandingTenantPlayersInput,
  ListOutstandingTenantPlayersOutput
> {
  private readonly repo = new EntryOutstandingRepository();

  protected async execute(input: ListOutstandingTenantPlayersInput): Promise<ListOutstandingTenantPlayersOutput> {
    const data = await this.repo.aggregatePlayersByDrawAndTenant(input.drawId, input.tenantId);
    return { data };
  }
}
