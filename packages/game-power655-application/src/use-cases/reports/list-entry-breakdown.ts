import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ListEntryBreakdownInput, ListEntryBreakdownOutput } from "./types";

/**
 * Entries cho 1 draw × 1 tenant × 1 player. Drill cấp 4.
 *
 * Dùng cho Entry Breakdown table.
 * Index: { drawId: 1, tenantId: 1, accountId: 1 }
 */
export class ListEntryBreakdownUseCase extends NextApiUseCase<ListEntryBreakdownInput, ListEntryBreakdownOutput> {
  private readonly repo = new EntryRepository();

  protected async execute(input: ListEntryBreakdownInput): Promise<ListEntryBreakdownOutput> {
    const data = await this.repo.findByDrawTenantPlayer(input.drawId, input.tenantId, input.accountId);
    return { data };
  }
}
