import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ListPlayerBreakdownInput, ListPlayerBreakdownOutput } from "./types";

/**
 * Aggregate player breakdown cho 1 draw × tenant — drill-down cấp 3.
 *
 * Group by accountId, SUM entries, lines, stake, win, payout.
 */
export class ListPlayerBreakdownUseCase extends NextApiUseCase<
  ListPlayerBreakdownInput,
  ListPlayerBreakdownOutput
> {
  private readonly repo = new EntryRepository();

  protected async execute(input: ListPlayerBreakdownInput): Promise<ListPlayerBreakdownOutput> {
    const data = await this.repo.aggregatePlayersByDrawAndTenant({
      drawId: input.drawId,
      tenantId: input.tenantId,
    });
    return { data };
  }
}
