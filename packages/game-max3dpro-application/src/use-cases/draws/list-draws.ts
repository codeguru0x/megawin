import { NextApiUseCase } from "@megawin/next/server";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawSummary, ListDrawsInput, ListDrawsOutput } from "./dto/draw.dto";

/**
 * Danh sách kỳ quay cho backoffice.
 * Hỗ trợ filter theo status, date range, pagination.
 */
export class ListDrawsUseCase extends NextApiUseCase<ListDrawsInput, ListDrawsOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: ListDrawsInput): Promise<ListDrawsOutput> {
    const page = input.page ?? 1;
    const size = input.size ?? 20;
    const draws = await this.drawRepo.listDraws(
      {
        status: input.status,
        fromDate: input.fromDate,
        toDate: input.toDate,
      },
      page,
      size,
    );

    const summaries: DrawSummary[] = draws.map((d) => ({
      id: d.id,
      drawId: d.drawId,
      drawDate: d.drawDate,
      financialDate: d.financialDate,
      drawNo: d.drawNo,
      drawTime: d.drawTime.toISOString(),
      openAt: d.sales?.openAt?.toISOString(),
      closeAt: d.sales.closeAt.toISOString(),
      status: d.status,
      hasResult: !!d.result,
      result: d.result
        ? {
            special: d.result.special,
            first: d.result.first,
            second: d.result.second,
            third: d.result.third,
          }
        : undefined,
      ticketEntryCount: d.stats?.ticketEntryCount,
      totalRevenue: d.stats?.totalSalesAmount,
      totalPayout: d.stats?.totalPayoutAmount,
      financial: d.financial
        ? {
            totalFixedPrizes: d.financial.totalFixedPrizes,
            totalAgentCommission: d.financial.totalAgentCommission,
            companyTake: d.financial.companyTake,
          }
        : undefined,
    }));

    return { draws: summaries, page, size };
  }
}
