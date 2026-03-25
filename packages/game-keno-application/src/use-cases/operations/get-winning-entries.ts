import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { KENO_SIDE_BET_PLAY_TYPE_SET } from "@megawin/game-keno/entities";
import type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningEntryBoardDetail,
} from "./dto/winning-entries.dto";

/**
 * Danh sách entries trúng thưởng của một kỳ quay Keno.
 *
 * Cursor-based pagination: sort by payout.winAmount desc.
 * boardDetails[] chứa cả cơ bản (matchCount/pickCount) và bổ sung (outcome/isWin).
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
        // boardPayouts[] chứa cả cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd).
        // Cơ bản: matchCount + pickCount meaningful, bet/outcome/isWin = undefined.
        // Bổ sung: bet + outcome + isWin meaningful, matchCount = 0, pickCount = 0.
        const boardDetails: WinningEntryBoardDetail[] = (e.payout?.boardPayouts ?? [])
          .filter((b: any) => b.winAmount > 0)
          .map((b: any) => {
            const isSideBet = KENO_SIDE_BET_PLAY_TYPE_SET.has(b.playType);
            const board = (e.entrySummary?.boards ?? []).find(
              (sb: any) => sb.boardNo === b.boardNo,
            );

            return {
              boardNo: b.boardNo as string,
              playType: b.playType as string,
              // Cơ bản: numbers từ entrySummary. Bổ sung: undefined.
              ...(board?.numbers ? { numbers: board.numbers as string[] } : {}),
              matchCount: b.matchCount as number | null,
              pickCount: b.pickCount as number | null,
              // Bổ sung: bet + outcome + isWin. Cơ bản: undefined.
              ...(b.bet ? { bet: b.bet as string } : {}),
              ...(b.outcome !== undefined ? { outcome: b.outcome as string } : {}),
              isWin: b.isWin as boolean,
              winAmount: b.winAmount as number,
              isCapped:
                !isSideBet &&
                (e.hasCappablePrize ?? false) &&
                b.pickCount >= 8 &&
                b.matchCount === b.pickCount,
            };
          });

        return {
          entryId: e.id,
          username: e.username,
          tenantId: e.tenantId,
          amount: e.amount,
          winAmount: e.payout?.winAmount ?? 0,
          boardDetails,
          createdAt: e.createdAt.toISOString(),
          settledAt: e.payout?.settledAt?.toISOString() ?? "",
        };
      }),
    };
  }
}
