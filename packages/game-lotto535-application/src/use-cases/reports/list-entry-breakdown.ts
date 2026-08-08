import { NextApiUseCase } from "@megawin/next/server";

import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ListEntryBreakdownInput, ListEntryBreakdownOutput } from "./types";

/**
 * Danh sách entries của 1 player × 1 draw × 1 tenant. Drill cấp 4.
 *
 * BẮT BUỘC cả 3 params: drawId, tenantId, accountId.
 * Kết quả thường rất nhỏ (~10-20 entries/player/draw).
 */
export class ListEntryBreakdownUseCase extends NextApiUseCase<ListEntryBreakdownInput, ListEntryBreakdownOutput> {
  private readonly repo = new EntryRepository();

  protected async execute(input: ListEntryBreakdownInput): Promise<ListEntryBreakdownOutput> {
    const data = await this.repo.findByDrawTenantPlayer(input.drawId, input.tenantId, input.accountId);
    return { data };
  }
}
