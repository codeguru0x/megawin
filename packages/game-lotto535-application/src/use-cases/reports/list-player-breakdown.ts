import { UseCase } from "@megawin/app-core/use-cases";

import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ListPlayerBreakdownInput, ListPlayerBreakdownOutput } from "./types";

/**
 * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3 tab "Theo kỳ quay".
 *
 * BẮT BUỘC cả drawId lẫn tenantId — KHÔNG query cross-draw.
 * Sắp xếp theo totalStake DESC.
 * Index: { drawId: 1, "tenant.tenantId": 1, accountId: 1 }
 */
export class ListPlayerBreakdownUseCase extends UseCase<ListPlayerBreakdownInput, ListPlayerBreakdownOutput> {
  private readonly repo = new EntryRepository();

  protected async execute(input: ListPlayerBreakdownInput): Promise<ListPlayerBreakdownOutput> {
    const data = await this.repo.aggregatePlayersByDrawAndTenant(input.drawId, input.tenantId);
    return { data };
  }
}
