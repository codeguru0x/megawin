import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { GetLiveEntriesInput, GetLiveEntriesOutput, LiveEntryBoard, LiveEntryItem } from "./dto/live-entries.dto";

/**
 * Lấy N entries mới nhất của một kỳ quay Max 3D Pro.
 *
 * Mục đích: cung cấp dữ liệu cho live feed panel trên dashboard vận hành.
 * - Kỳ đang bán: refetch mỗi 30s bằng React Query
 * - Kỳ đã kết sổ: gọi 1 lần, hiển thị static "N đơn cuối kỳ"
 *
 * Max 3D Pro đặc thù:
 * - Boards có triplets + playMode (multiNumber/multiDigit).
 * - multiDigit có thêm frontDigits + backDigits để hiển thị "[1,2,3] × [4,5,6]".
 * Không validate status kỳ (cho phép load entries của mọi trạng thái).
 */
export class GetLiveEntriesUseCase extends UseCase<GetLiveEntriesInput, GetLiveEntriesOutput> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: GetLiveEntriesInput): Promise<GetLiveEntriesOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    const limit = Math.min(input.limit ?? 50, 100);

    const [entries, totalCount] = await Promise.all([
      this.entryRepo.getLatestEntriesByDrawId(input.drawId, limit),
      this.entryRepo.countEntriesByDrawId(input.drawId),
    ]);

    const items: LiveEntryItem[] = entries.map((e) => {
      const boards: LiveEntryBoard[] = (e.entrySummary?.boards ?? []).map((b) => ({
        boardNo: b.boardNo,
        playMode: b.playMode,
        playType: b.playType,
        triplets: b.triplets,
        // multiDigit: truyền frontDigits + backDigits để UI hiển thị "[1,2,3] × [4,5,6]"
        frontDigits: b.frontDigits,
        backDigits: b.backDigits,
        lineCount: b.lineCount,
        // betCount fallback sang 1 cho entries cũ.
        betCount: b.betCount ?? 1,
      }));

      return {
        entryId: e.id,
        username: e.username,
        tenantId: e.tenantId,
        amount: e.amount,
        lineCount: e.lineCount,
        // betUnitCount = Σ(board.lineCount × board.betCount) — phản ánh tiền thực.
        // Fallback sang lineCount cho entries cũ (betCount = 1).
        betUnitCount: e.betUnitCount ?? e.lineCount,
        boards,
        createdAt: e.createdAt.toISOString(),
      };
    });

    return {
      drawId: input.drawId,
      entries: items,
      totalCount,
    };
  }
}
