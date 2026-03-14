import { NextApiUseCase } from "@megawin/next/server";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { getFinancialDateToday } from "./helpers";
import type {
  GetPlayTypeDistributionInput,
  PlayTypeDistributionOutput,
  PlayTypeDistributionItem,
} from "./dto/operations.dto";

/**
 * Lấy phân bổ cược theo playMode cho dashboard vận hành Max 3D Pro.
 *
 * Max 3D Pro có 2 playMode (KHÔNG có playType combo):
 *   - multiNumber: chọn 3-20 bộ ba → C(n,2) cặp TripletPair
 *   - multiDigit: 3 chữ số đầu + 3 chữ số sau → perms(front) × perms(back) cặp
 *
 * Group by playMode → boardCount, lineCount, entryCount, revenue, avgPairsPerEntry.
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
    const rawDistribution = await this.entryRepo.aggregatePlayTypeDistribution({
      financialDate,
      drawId: input.drawId,
    });

    // Tính avgPairsPerEntry = lineCount / entryCount (tránh chia 0)
    const distribution: PlayTypeDistributionItem[] = rawDistribution.map((row) => ({
      playMode: row.playMode as PlayTypeDistributionItem["playMode"],
      boardCount: row.boardCount,
      lineCount: row.lineCount,
      entryCount: row.entryCount,
      revenue: row.revenue,
      avgPairsPerEntry: row.entryCount > 0 ? Math.round(row.lineCount / row.entryCount) : 0,
    }));

    return { financialDate, distribution };
  }
}
