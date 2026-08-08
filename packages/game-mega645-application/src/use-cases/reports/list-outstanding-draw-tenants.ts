import { NextApiUseCase } from "@megawin/next/server";
import { EntryOutstandingRepository } from "../../infras/repos/entry-outstanding-repo";
import type { ListOutstandingDrawTenantsInput, ListOutstandingDrawTenantsOutput } from "./types";

/**
 * Aggregate tenant breakdown cho 1 draw outstanding. Drill cấp 2.
 *
 * Double-$group để đếm playerCount chính xác (dedup accounts per tenant).
 * Chỉ filter status = "scheduled" — bỏ qua entries đã settle/void.
 * Index: { drawId: 1, tenantId: 1, accountId: 1 }
 */
export class ListOutstandingDrawTenantsUseCase extends NextApiUseCase<
  ListOutstandingDrawTenantsInput,
  ListOutstandingDrawTenantsOutput
> {
  private readonly repo = new EntryOutstandingRepository();

  protected async execute(input: ListOutstandingDrawTenantsInput): Promise<ListOutstandingDrawTenantsOutput> {
    const data = await this.repo.aggregateTenantsByDraw(input.drawId);
    return { data };
  }
}
