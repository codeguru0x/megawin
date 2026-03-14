import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type { OpsQueryInput, PlayTypeDistributionOutput } from "./dto/operations.dto";

/**
 * Phân bổ theo kiểu chơi cho Bingo 18 Operations Dashboard.
 *
 * Bingo 18: 5 play types → 6 rows trong UI (tripleMatch tách specific/any).
 * Thứ tự hiển thị: singleNum, doubleMatch, tripleMatch-specific, tripleMatch-any,
 * sumTotal (nhóm theo tổng), bigSmallDraw.
 */
export class GetPlayTypeDistributionUseCase extends NextApiUseCase<
  OpsQueryInput,
  PlayTypeDistributionOutput
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: OpsQueryInput): Promise<PlayTypeDistributionOutput> {
    const financialDate = input.financialDate ?? getFinancialDateToday();
    const distribution = await this.entryRepo.aggregatePlayTypeDistribution({
      financialDate,
      drawId: input.drawId,
    });

    return {
      financialDate,
      distribution: distribution.map((d) => ({
        playType: d.playType as any,
        tripleKind: d.tripleKind as any,
        selectionCount: d.selectionCount,
        entryCount: d.entryCount,
      })),
    };
  }
}
