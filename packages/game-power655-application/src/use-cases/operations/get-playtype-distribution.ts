import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type {
  GetPlayTypeDistributionInput,
  PlayTypeDistributionOutput,
  PlayTypeDistributionItem,
} from "./dto/operations.dto";

/**
 * Phân bổ cược theo kiểu chơi (PlayType) cho Power 6/55.
 *
 * Power 6/55 có nhiều kiểu chơi: standard, bao5, bao7-bao18.
 * Dùng để render biểu đồ kiểu chơi trên dashboard vận hành.
 *
 * CRASH-SAFE: idempotent, aggregate từ DB.
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
