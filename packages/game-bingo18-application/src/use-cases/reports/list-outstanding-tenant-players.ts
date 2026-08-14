import { UseCase } from "@megawin/app-core/use-cases";

import { EntryOutstandingRepository } from "../../infras/repos/entry-outstanding-repo";
import type { ListOutstandingTenantPlayersInput, ListOutstandingTenantPlayersOutput } from "./types";

/**
 * Aggregate player breakdown cho 1 draw × 1 tenant outstanding. Drill cấp 3.
 *
 * Group by accountId, sort totalStake DESC.
 * Chỉ filter status = "scheduled".
 * Bingo 18 KHÔNG có lineCount.
 * Index: { drawId: 1, tenantId: 1, accountId: 1 }
 */
export class ListOutstandingTenantPlayersUseCase extends UseCase<
  ListOutstandingTenantPlayersInput,
  ListOutstandingTenantPlayersOutput
> {
  private readonly repo = new EntryOutstandingRepository();

  protected async execute(input: ListOutstandingTenantPlayersInput): Promise<ListOutstandingTenantPlayersOutput> {
    const data = await this.repo.aggregatePlayersByDrawAndTenant(input.drawId, input.tenantId);
    return { data };
  }
}
