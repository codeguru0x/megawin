import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  GetLiveEntriesInput,
  GetLiveEntriesOutput,
  LiveEntryItem,
  LiveEntryBoard,
} from "./dto/live-entries.dto";

/**
 * Lấy N entries mới nhất của một kỳ quay.
 *
 * Mục đích: cung cấp dữ liệu cho live feed panel trên dashboard vận hành.
 * - Kỳ đang bán: refetch mỗi 30s bằng React Query
 * - Kỳ đã kết sổ: gọi 1 lần, hiển thị static "50 đơn cuối kỳ"
 *
 * Không validate status kỳ (cho phép load entries của mọi trạng thái).
 */
export class GetLiveEntriesUseCase extends NextApiUseCase<
  GetLiveEntriesInput,
  GetLiveEntriesOutput
> {
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
        playType: b.playType,
        mainNumbers: b.mainNumbers,
        specialNumbers: b.specialNumbers,
        expandedLines: b.expandedLines,
      }));

      return {
        entryId: e.id,
        username: e.username,
        tenantId: e.tenantId,
        amount: e.amount,
        lineCount: e.lineCount,
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
