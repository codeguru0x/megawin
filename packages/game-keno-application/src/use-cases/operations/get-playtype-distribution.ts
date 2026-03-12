import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type {
  GetPlayTypeDistributionInput,
  PlayTypeDistributionOutput,
} from "./dto/operations.dto";

/**
 * Phân bổ theo kiểu chơi cho Keno Operations Dashboard.
 *
 * Keno: 12 kiểu chơi — pick1-pick10 (basic) + bigSmall + evenOdd (side bets).
 * Basic và side bet được aggregate riêng biệt rồi merge.
 */
export class GetPlayTypeDistributionUseCase extends NextApiUseCase<
  GetPlayTypeDistributionInput,
  PlayTypeDistributionOutput
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(
    input: GetPlayTypeDistributionInput,
  ): Promise<PlayTypeDistributionOutput> {
    const financialDate = input.financialDate ?? getFinancialDateToday();
    const distribution = await this.entryRepo.aggregatePlayTypeDistribution({
      financialDate,
      drawId: input.drawId,
    });

    return {
      financialDate,
      distribution: distribution.map((d) => ({
        playType: d.playType as any,
        selectionCount: d.selectionCount,
        entryCount: d.entryCount,
        revenue: d.revenue,
      })),
    };
  }
}
