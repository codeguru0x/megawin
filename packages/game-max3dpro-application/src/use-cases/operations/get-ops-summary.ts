import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { GetOpsSummaryInput, OpsSummaryOutput } from "./dto/operations.dto";

/**
 * Lấy KPI tổng hợp cho dashboard vận hành Max 3D Pro.
 *
 * Hỗ trợ filter theo ngày tài chính (mặc định hôm nay) hoặc 1 kỳ cụ thể.
 * Không có Jackpot → chỉ có 5 KPI: revenue, entries, lines (TripletPair), players, commission.
 */
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
