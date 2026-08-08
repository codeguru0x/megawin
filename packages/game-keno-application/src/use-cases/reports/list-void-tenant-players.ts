import { NextApiUseCase } from "@megawin/next/server";
import { EntryVoidRepository } from "../../infras/repos/entry-void-repo";
import type { ListVoidTenantPlayersInput, ListVoidTenantPlayersOutput } from "./types";

/**
 * Aggregate player breakdown cho 1 draw × 1 tenant đã void. Drill cấp 3.
 *
 * Group by accountId, lấy username từ doc đầu tiên.
 * Chỉ filter status = "void".
 * Index: { drawId: 1, tenantId: 1, accountId: 1 }
 */
export class ListVoidTenantPlayersUseCase extends NextApiUseCase<
  ListVoidTenantPlayersInput,
  ListVoidTenantPlayersOutput
> {
  private readonly repo = new EntryVoidRepository();

  protected async execute(input: ListVoidTenantPlayersInput): Promise<ListVoidTenantPlayersOutput> {
    const data = await this.repo.aggregatePlayersByDrawAndTenant(input.drawId, input.tenantId);
    return { data };
  }
}
