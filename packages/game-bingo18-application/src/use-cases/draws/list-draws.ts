import { UseCase } from "@megawin/app-core/use-cases";

import { DrawRepository } from "../../infras/repos/draw-repo";
import type { DrawSummary, ListDrawsInput, ListDrawsOutput } from "./dto/draw.dto";

export class ListDrawsUseCase extends UseCase<ListDrawsInput, ListDrawsOutput> {
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
      result: d.result ? { diceNumbers: d.result.numbers, sum: d.result.sum } : undefined,
      ticketEntryCount: d.stats?.ticketEntryCount,
      totalRevenue: d.stats?.totalSalesAmount,
      totalPayout: d.stats?.totalPayoutAmount,
      financial: d.financial
        ? {
            totalPrizes: d.financial.totalPrizes,
            totalAgentCommission: d.financial.totalAgentCommission,
            companyTake: d.financial.companyTake,
          }
        : undefined,
    }));

    return { draws: summaries, page, size };
  }
}
