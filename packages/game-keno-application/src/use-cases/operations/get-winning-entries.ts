import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningEntryBoardDetail,
  WinningEntrySideBetDetail,
} from "./dto/winning-entries.dto";

/**
 * Danh sách entries trúng thưởng của một kỳ quay Keno.
 *
 * Cursor-based pagination: sort by payout.winAmount desc.
 * Keno khác biệt: board detail dùng matchCount/pickCount, không phải PrizeTier.
 * Side bet detail có outcome + isWin + winAmount.
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
    const nextCursor = entries.length === limit && lastEntry ? lastEntry.id : null;

    return {
      drawId,
      summary,
      nextCursor,
      entries: entries.map((e) => {
        const boardDetails: WinningEntryBoardDetail[] = (e.payout?.boardPayouts ?? [])
          .filter((b: any) => b.winAmount > 0)
          .map((b: any) => ({
            boardNo: b.boardNo as number,
            playType: b.playType as string,
            // Lấy numbers từ entrySummary.boards tương ứng boardNo
            numbers:
              (e.entrySummary?.boards ?? []).find((sb: any) => sb.boardNo === b.boardNo)?.numbers ??
              [],
            matchCount: b.matchCount as number,
            pickCount: b.pickCount as number,
            winAmount: b.winAmount as number,
            isCapped:
              (e.hasCappablePrize ?? false) && b.pickCount >= 8 && b.matchCount === b.pickCount,
          }));

        const sideBetDetails: WinningEntrySideBetDetail[] = (e.payout?.sideBetPayouts ?? [])
          .filter((s: any) => s.winAmount > 0)
          .map((s: any) => ({
            playType: s.playType as string,
            bet: s.bet as string,
            outcome: s.outcome as string,
            isWin: true,
            winAmount: s.winAmount as number,
          }));

        return {
          entryId: e.id,
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
