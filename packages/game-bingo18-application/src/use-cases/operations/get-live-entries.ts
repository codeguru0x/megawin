import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  GetLiveEntriesInput,
  GetLiveEntriesOutput,
  LiveEntryBoard,
  LiveEntrySideBet,
} from "./dto/live-entries.dto";

/**
 * Live feed entries mới nhất cho một kỳ quay Bingo 18.
 *
 * Trả về N entries vừa đặt gần đây nhất (sort createdAt desc).
 * Dùng cho panel realtime trên Operations Dashboard.
 * Bingo 18 tách biệt boards cơ bản và side bets.
 */
export class GetLiveEntriesUseCase extends NextApiUseCase<
  GetLiveEntriesInput,
  GetLiveEntriesOutput
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: GetLiveEntriesInput): Promise<GetLiveEntriesOutput> {
    const { drawId } = input;
    const limit = Math.min(input.limit ?? 50, 100);

    // Validate drawId tồn tại
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }

    const [entries, totalCount] = await Promise.all([
      this.entryRepo.getLatestEntriesByDrawId(drawId, limit),
      this.entryRepo.countEntriesByDrawId(drawId),
    ]);

    return {
      drawId,
      totalCount,
      entries: entries.map((e) => {
        const boards: LiveEntryBoard[] = (e.entrySummary?.boards ?? []).map((b: any) => ({
          boardNo: b.boardNo as string,
          playType: b.playType as any,
          number: b.number as number | undefined,
          tripleKind: b.tripleKind as any,
        }));

        const sideBets: LiveEntrySideBet[] = (e.entrySummary?.sideBets ?? []).map((s: any) => ({
          playType: s.playType as any,
          sum: s.sum as number | undefined,
          bet: s.bet as any,
        }));

        return {
          entryId: e.id,
          username: e.username,
          tenantId: e.tenantId,
          amount: e.amount,
          boardCount: boards.length,
          sideBetCount: sideBets.length,
          boards,
          sideBets,
          createdAt: e.createdAt.toISOString(),
        };
      }),
    };
  }
}
