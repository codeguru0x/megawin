import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { GetOpsSummaryInput, OpsSummaryOutput } from "./dto/operations.dto";

export class GetOpsSummaryUseCase extends NextApiUseCase<GetOpsSummaryInput, OpsSummaryOutput> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: GetOpsSummaryInput): Promise<OpsSummaryOutput> {
    const financialDate = input.financialDate ?? getFinancialDateToday();
    const summary = await this.entryRepo.aggregateOpsSummary({
      financialDate,
      drawId: input.drawId,
    });

    return { financialDate, ...summary };
  }
}
