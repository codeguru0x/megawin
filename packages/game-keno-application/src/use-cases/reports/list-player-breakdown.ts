import { NextApiUseCase } from "@megawin/next/server";

import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ListPlayerBreakdownInput, ListPlayerBreakdownOutput } from "./types";

/**
 * Aggregate player breakdown cho 1 draw × tenant — drill-down level 3.
 *
 * Keno KHÔNG có lineCount.
 */
export class ListPlayerBreakdownUseCase extends NextApiUseCase<ListPlayerBreakdownInput, ListPlayerBreakdownOutput> {
  private readonly repo = new EntryRepository();

  protected async execute(input: ListPlayerBreakdownInput): Promise<ListPlayerBreakdownOutput> {
    const rows = await this.repo.aggregatePlayersByDrawAndTenant(input.drawId, input.tenantId);
    const data = rows.map((r) => ({
      accountId: r.accountId,
      username: r.username,
      entryCount: r.entryCount,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
    }));
    return { data };
  }
}
