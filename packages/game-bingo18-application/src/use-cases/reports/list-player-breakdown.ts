import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ListPlayerBreakdownInput, ListPlayerBreakdownOutput } from "./types";

export class ListPlayerBreakdownUseCase extends NextApiUseCase<ListPlayerBreakdownInput, ListPlayerBreakdownOutput> {
  private readonly repo = new EntryRepository();
  protected async execute(input: ListPlayerBreakdownInput): Promise<ListPlayerBreakdownOutput> {
    const rows = await this.repo.aggregatePlayersByDrawAndTenant(input.drawId, input.tenantId);
    return {
      data: rows.map((r) => ({
        accountId: r.accountId,
        username: r.username,
        entryCount: r.entryCount,
        totalStake: r.totalStake,
        totalWin: r.totalWin,
        totalPayout: r.totalPayout,
      })),
    };
  }
}
