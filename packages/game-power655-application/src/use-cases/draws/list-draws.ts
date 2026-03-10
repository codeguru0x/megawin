import { NextApiUseCase } from "@megawin/next/server";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { ListDrawsInput, ListDrawsOutput, DrawSummary } from "./dto/draw.dto";

/**
 * Danh sách kỳ quay Power 6/55 cho backoffice.
 * Hỗ trợ filter theo status, date range, pagination.
 */
export class ListDrawsUseCase extends NextApiUseCase<ListDrawsInput, ListDrawsOutput> {
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
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
      drawNo: d.drawNo,
      drawTime: d.drawTime.toISOString(),
      status: d.status,
      jackpot1Amount: d.jackpot?.openingJackpot1,
      jackpot2Amount: d.jackpot?.openingJackpot2,
      jackpot1ClosingAmount: d.jackpot?.closingJackpot1,
      jackpot2ClosingAmount: d.jackpot?.closingJackpot2,
      hasResult: !!d.result,
      totalEntries: d.stats?.totalEntries,
      totalRevenue: d.financial?.totalRevenue,
      financial: d.financial
        ? {
            totalFixedPrizes: d.financial.totalFixedPrizes,
            totalAgentCommission: d.financial.totalAgentCommission,
            companyTake: d.financial.companyTake,
            jackpot1Contribution: d.financial.jackpot1Contribution,
            jackpot2Contribution: d.financial.jackpot2Contribution,
          }
        : undefined,
    }));

    return { draws: summaries, page, size };
  }
}
