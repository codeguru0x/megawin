import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type {
  GetPlayTypeDistributionInput,
  PlayTypeDistributionOutput,
  PlayTypeDistributionItem,
} from "./dto/operations.dto";

/**
 * Lấy phân bổ cược theo (playMode, playType) cho dashboard vận hành Max 3D.
 *
 * Max 3D có 2 playMode × 4 playType:
 *   - basic: straight, combo3, combo6, quickPick
 *   - plus: straight, quickPick (không có combo)
 *
 * Group by (playMode, playType) → boardCount, lineCount, entryCount, revenue.
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
      distribution: distribution as unknown as PlayTypeDistributionItem[],
    };
  }
}
