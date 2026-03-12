import { NextApiUseCase } from "@megawin/next/server";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { ListDrawsInput, ListDrawsOutput, DrawSummary } from "./dto/draw.dto";

/**
 * Danh sách kỳ quay cho backoffice.
 * Hỗ trợ filter theo status, date range, cursor-based pagination.
 */
export class ListDrawsUseCase extends NextApiUseCase<ListDrawsInput, ListDrawsOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: ListDrawsInput): Promise<ListDrawsOutput> {
    const size = input.size ?? 20;

    const draws = await this.drawRepo.listDrawsCursor(
      {
        status: input.status,
        fromDate: input.fromDate,
        toDate: input.toDate,
      },
      input.cursor,
      size,
    );

    const hasMore = draws.length > size;
    const slice = hasMore ? draws.slice(0, size) : draws;
    const nextCursor = hasMore ? slice[slice.length - 1]!.drawId : null;

    const summaries: DrawSummary[] = slice.map((d) => ({
      id: d.id,
      drawId: d.drawId,
      drawDate: d.drawDate,
      drawNo: d.drawNo,
      drawTime: d.drawTime.toISOString(),
      status: d.status,
      jackpotAmount: d.jackpot?.openingAmount,
      jackpotClosingAmount: d.jackpot?.closingAmount,
      isSplitCycle: d.jackpot?.isSplitCycle ?? false,
      hasResult: !!d.result,
      result: d.result
        ? {
            winningMain: [...d.result.winningMain] as string[],
            winningSpecial: d.result.winningSpecial as string,
          }
        : undefined,
      ticketEntryCount: d.stats?.ticketEntryCount,
      totalLineCount: d.stats?.totalLineCount,
      totalRevenue: d.stats?.totalSalesAmount,
      totalPrizesPayout: d.stats?.totalPayoutAmount,
      financial: d.financial
        ? {
            totalFixedPrizes: d.financial.totalFixedPrizes,
            totalAgentCommission: d.financial.totalAgentCommission,
            companyTake: d.financial.actualCompanyTake,
            jackpotContribution: d.financial.jackpotContribution,
          }
        : undefined,
    }));

    return { draws: summaries, nextCursor, size };
  }
}
