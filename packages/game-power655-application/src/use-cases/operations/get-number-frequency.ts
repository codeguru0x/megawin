import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { GetNumberFrequencyInput, NumberFrequencyOutput } from "./dto/operations.dto";

/**
 * Tần suất xuất hiện của từng số trong các bộ cược Power 6/55.
 *
 * Power 6/55 có mainNumbers (01-55), không có specialNumbers trong selection.
 * Dùng để render heatmap 55 ô trên dashboard vận hành.
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
