import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { Pagination } from "@megawin/shared/constants/pagination";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { GetWinningEntriesInput, GetWinningEntriesOutput, WinningBoardDetail } from "./dto/winning-entries.dto";

/**
 * Danh sách entries trúng thưởng của một kỳ quay Bingo 18.
 *
 * Cursor-based pagination: sort by payout.winAmount desc.
 * boardDetails chứa cả cơ bản và bổ sung:
 *   - Cơ bản: matchCount (singleNum: 1/2/3) + tripleKind? (specific/any)
 *   - Bổ sung: sum/bet + outcome + isWin + winAmount, matchCount = null
 *   - KHÔNG có payout cap (giải cố định, đơn giản hơn Keno)
 */
export class GetWinningEntriesUseCase extends NextApiUseCase<GetWinningEntriesInput, GetWinningEntriesOutput> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: GetWinningEntriesInput): Promise<GetWinningEntriesOutput> {
    const { drawId } = input;
    const limit = Math.min(input.limit ?? Pagination.Report.Size, Pagination.Report.Max);

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    const [entries, summary] = await Promise.all([
      this.entryRepo.getWinningEntries(drawId, input.cursor, limit),
      this.entryRepo.getWinningEntriesSummary(drawId),
    ]);

    const lastEntry = entries[entries.length - 1];
    const nextCursor = entries.length === limit && lastEntry ? lastEntry.id : null;

    return {
      drawId,
      summary: {
        totalWinningEntries: summary.totalWinningEntries,
        totalWinAmount: summary.totalWinAmount,
      },
      nextCursor,
      entries: entries.map((e) => {
        // boardPayouts chứa cả cơ bản và bổ sung — lọc boards thắng (winAmount > 0)
        const boardDetails: WinningBoardDetail[] = (e.payout?.boardPayouts ?? [])
          .filter((b: any) => b.winAmount > 0)
          .map((b: any) => ({
            boardNo: b.boardNo as string,
            playType: b.playType as any,
            number: (e.entrySummary?.boards ?? []).find((sb: any) => sb.boardNo === b.boardNo)?.number,
            tripleKind: b.tripleKind as any,
            matchCount: b.matchCount as number | null,
            sum: b.sum as number | undefined,
            bet: b.bet as any,
            outcome: b.outcome as string | undefined,
            isWin: b.isWin as boolean,
            winAmount: b.winAmount as number,
          }));

        return {
          entryId: e.id,
          username: e.username,
          tenantId: e.tenantId,
          amount: e.amount,
          winAmount: e.payout?.winAmount ?? 0,
          winningNumbers: e.result?.numbers ?? [],
          drawSum: e.result?.sum ?? 0,
          boardDetails,
          createdAt: e.createdAt.toISOString(),
          settledAt: e.payout?.settledAt?.toISOString() ?? "",
        };
      }),
    };
  }
}
