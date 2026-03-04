import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { GetNumberFrequencyInput, NumberFrequencyOutput } from "./dto/operations.dto";

export class GetNumberFrequencyUseCase extends NextApiUseCase<
  GetNumberFrequencyInput,
  NumberFrequencyOutput
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: GetNumberFrequencyInput): Promise<NumberFrequencyOutput> {
    const financialDate = input.financialDate ?? getFinancialDateToday();
    const freq = await this.entryRepo.aggregateNumberFrequency({
      financialDate,
      drawId: input.drawId,
    });

    return { financialDate, ...freq };
  }
}
