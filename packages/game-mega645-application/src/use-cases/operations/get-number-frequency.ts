import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { GetNumberFrequencyInput, NumberFrequencyOutput } from "./dto/operations.dto";

/**
 * Tần suất xuất hiện của từng số trong các bộ cược Mega 6/45.
 *
 * Mega 6/45 chỉ có numbers (01-45), không có specialNumbers.
 * Dùng để render heatmap 45 ô trên dashboard vận hành.
 *
 * CRASH-SAFE: idempotent, aggregate từ DB.
 */
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
