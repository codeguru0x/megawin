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
    const { drawId } = input;
    console.log("[ListVoidDrawTenants] drawId received:", JSON.stringify(drawId));

    // Debug: đếm entries void cho drawId để xác nhận data tồn tại
    const debugCount = await this.repo.count({ drawId, status: "void" });
    console.log("[ListVoidDrawTenants] entry count (status=void, drawId=%s):", drawId, debugCount);

    // Debug: đếm tất cả entries cho drawId (bất kể status) để thấy tổng
    const totalCount = await this.repo.count({ drawId });
    console.log("[ListVoidDrawTenants] total entries (drawId=%s):", drawId, totalCount);

    const data = await this.repo.aggregateTenantsByDraw(drawId);
    console.log("[ListVoidDrawTenants] result count:", data.length, "data:", JSON.stringify(data));
    return { data };
  }
}
