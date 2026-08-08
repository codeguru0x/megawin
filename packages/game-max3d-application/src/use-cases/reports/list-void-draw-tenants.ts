import { NextApiUseCase } from "@megawin/next/server";
import { EntryVoidRepository } from "../../infras/repos/entry-void-repo";
import type { ListVoidDrawTenantsInput, ListVoidDrawTenantsOutput } from "./types";

/**
 * Aggregate tenant breakdown cho 1 draw đã void. Drill cấp 2.
 *
 * Double-$group để đếm playerCount chính xác (dedup accounts per tenant).
 * Chỉ filter status = "void".
 * Index: { drawId: 1, tenantId: 1, accountId: 1 }
 */
export class ListVoidDrawTenantsUseCase extends NextApiUseCase<ListVoidDrawTenantsInput, ListVoidDrawTenantsOutput> {
  private readonly repo = new EntryVoidRepository();

  protected async execute(input: ListVoidDrawTenantsInput): Promise<ListVoidDrawTenantsOutput> {
    const data = await this.repo.aggregateTenantsByDraw(input.drawId);
    return { data };
  }
}
