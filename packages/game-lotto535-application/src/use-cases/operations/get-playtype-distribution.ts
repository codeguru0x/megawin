import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type {
  GetPlayTypeDistributionInput,
  PlayTypeDistributionOutput,
  PlayTypeDistributionItem,
} from "./dto/operations.dto";

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

    return { financialDate, distribution: distribution as unknown as PlayTypeDistributionItem[] };
  }
}
