import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningBoardDetail,
  WinningSideBetDetail,
} from "./dto/winning-entries.dto";

/**
 * Danh sách entries trúng thưởng của một kỳ quay Bingo 18.
 *
 * Cursor-based pagination: sort by payout.winAmount desc.
 * Bingo 18 khác biệt:
 *   - Board detail: matchCount (singleNum: 1/2/3) + tripleKind? (specific/any)
 *   - Side bet detail: sum/bet + outcome + isWin + winAmount
 *   - KHÔNG có payout cap (giải cố định, đơn giản hơn Keno)
 */
export class GetWinningEntriesUseCase extends NextApiUseCase<
  GetWinningEntriesInput,
  GetWinningEntriesOutput
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: GetWinningEntriesInput): Promise<GetWinningEntriesOutput> {
    const { drawId } = input;
    const limit = Math.min(input.limit ?? 50, 200);

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    const [entries, summary] = await Promise.all([
      this.entryRepo.getWinningEntries(drawId, input.cursor, limit),
      this.entryRepo.getWinningEntriesSummary(drawId),
    ]);

    const lastEntry = entries[entries.length - 1];
    const nextCursor = entries.length === limit && lastEntry ? String(lastEntry._id) : null;

    return {
      drawId,
      summary: {
        totalWinningEntries: summary.totalWinningEntries,
        totalWinAmount: summary.totalWinAmount,
      },
      nextCursor,
      entries: entries.map((e) => {
        const boardDetails: WinningBoardDetail[] = (e.payout?.boardPayouts ?? [])
          .filter((b: any) => b.winAmount > 0)
          .map((b: any) => ({
            boardNo: b.boardNo as string,
            playType: b.playType as any,
            // Lấy number từ entrySummary.boards tương ứng boardNo
            number: (e.entrySummary?.boards ?? []).find((sb: any) => sb.boardNo === b.boardNo)
              ?.number,
            tripleKind: b.tripleKind as any,
            matchCount: b.matchCount as number,
            winAmount: b.winAmount as number,
          }));

        const sideBetDetails: WinningSideBetDetail[] = (e.payout?.sideBetPayouts ?? [])
          .filter((s: any) => s.winAmount > 0)
          .map((s: any) => ({
            playType: s.playType as any,
            sum: s.sum as number | undefined,
            bet: s.bet as any,
            outcome: s.outcome as string,
            isWin: true,
            winAmount: s.winAmount as number,
          }));

        return {
          entryId: String(e._id),
          username: e.username,
          tenantId: e.tenantId,
          amount: e.amount,
          winAmount: e.payout?.winAmount ?? 0,
          boardDetails,
          sideBetDetails,
          createdAt: e.createdAt.toISOString(),
          settledAt: e.payout?.settledAt?.toISOString() ?? "",
        };
      }),
    };
  }
}
