import { NextApiUseCase } from "@megawin/next/server";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { ListDrawsInput, ListDrawsOutput, DrawSummary } from "./dto/draw.dto";

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
      jackpotAmount: d.jackpot?.openingAmount,
      jackpotClosingAmount: d.jackpot?.closingAmount,
      hasResult: !!d.result,
      result: d.result
        ? {
            winningNumbers: d.result?.winningNumbers ?? [],
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
            actualCompanyTake: d.financial.actualCompanyTake,
            jackpotContribution: d.financial.jackpotContribution,
          }
        : undefined,
    }));

    return { draws: summaries, page, size };
  }
}
