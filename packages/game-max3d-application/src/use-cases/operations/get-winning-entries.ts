import { UseCase } from "@megawin/app-core/use-cases";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { BasicPrizeTier, PlusPrizeTier } from "@megawin/game-max3d/entities";
import { Pagination } from "@megawin/shared/constants/pagination";
import { AppException } from "@megawin/shared/errors";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningEntriesSummary,
  WinningEntryBoard,
  WinningEntryItem,
  WinningEntryTierDetail,
} from "./dto/winning-entries.dto";

/** Label tiếng Việt cho BasicPrizeTier. */
const BASIC_TIER_LABELS: Record<string, string> = {
  [BasicPrizeTier.Special]: "Giải Đặc Biệt",
  [BasicPrizeTier.First]: "Giải Nhất",
  [BasicPrizeTier.Second]: "Giải Nhì",
  [BasicPrizeTier.Third]: "Giải Ba",
};

/** Label tiếng Việt cho PlusPrizeTier. */
const PLUS_TIER_LABELS: Record<string, string> = {
  [PlusPrizeTier.Special]: "Giải ĐB (Plus)",
  [PlusPrizeTier.First]: "Giải Nhất (Plus)",
  [PlusPrizeTier.Second]: "Giải Nhì (Plus)",
  [PlusPrizeTier.Third]: "Giải Ba (Plus)",
  [PlusPrizeTier.Fourth]: "Giải Tư (Plus)",
  [PlusPrizeTier.Fifth]: "Giải Năm (Plus)",
  [PlusPrizeTier.Sixth]: "Giải Sáu (Plus)",
};

const ALL_TIER_LABELS: Record<string, string> = {
  ...BASIC_TIER_LABELS,
  ...PLUS_TIER_LABELS,
};

/**
 * Lấy danh sách entries trúng thưởng của 1 kỳ quay Max 3D.
 *
 * Chỉ trả về entries đã settle và có winAmount > 0.
 * Max 3D đặc thù:
 * - tier có thể là BasicPrizeTier (basic mode) hoặc PlusPrizeTier (plus mode).
 * - isDuplicate: plus mode có 2 bộ ba giống nhau → giải × 2.
 */
export class GetWinningEntriesUseCase extends UseCase<GetWinningEntriesInput, GetWinningEntriesOutput> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: GetWinningEntriesInput): Promise<GetWinningEntriesOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    const limit = Math.min(input.limit ?? Pagination.Report.Size, Pagination.Report.Max);
    const cursorId = input.cursor ?? undefined;

    const [entries, summary] = await Promise.all([
      this.entryRepo.getWinningEntries(input.drawId, limit, cursorId),
      this.entryRepo.getWinningEntriesSummary(input.drawId),
    ]);

    const items: WinningEntryItem[] = entries.map((e) => {
      const payoutTiers = (e.payout?.tiers ?? []).filter((t) => t.hitCount > 0);

      const tiers: WinningEntryTierDetail[] = payoutTiers.map((t) => ({
        tier: t.tier,
        tierLabel: ALL_TIER_LABELS[t.tier] ?? t.tier,
        hitCount: t.hitCount,
        unitAmount: t.unitAmount,
        amount: t.amount,
      }));

      const boards: WinningEntryBoard[] = (e.entrySummary?.boards ?? []).map((b) => ({
        boardNo: b.boardNo,
        playMode: b.playMode,
        playType: b.playType,
        triplets: b.triplets,
        lineCount: b.lineCount,
        // Plus mode: isDuplicate khi 2 triplets giống nhau
        isDuplicate: b.playMode === "plus" && b.triplets.length === 2 ? b.triplets[0] === b.triplets[1] : undefined,
      }));

      // Toàn bộ 20 bộ ba số kết quả kỳ quay (special + first + second + third),
      // flatten + dedup để highlight bộ ba trúng trên board.
      const r = e.result;
      const winningTriplets: string[] = r
        ? [...new Set([...(r.special ?? []), ...(r.first ?? []), ...(r.second ?? []), ...(r.third ?? [])])]
        : [];

      return {
        entryId: e.id,
        username: e.username,
        tenantId: e.tenantId,
        lineCount: e.lineCount,
        amount: e.amount,
        winAmount: e.payout?.winAmount ?? 0,
        boards,
        winningTriplets,
        tiers,
        createdAt: e.createdAt.toISOString(),
        settledAt: (e.payout?.settledAt ?? e.updatedAt).toISOString(),
      };
    });

    const winSummary: WinningEntriesSummary = {
      totalWinningEntries: summary.totalWinningEntries,
      totalWinningLines: summary.totalWinningLines,
      totalWinAmount: summary.totalWinAmount,
    };

    const nextCursor = entries.length === limit ? (entries[entries.length - 1]?.id ?? null) : null;

    return {
      drawId: input.drawId,
      entries: items,
      summary: winSummary,
      nextCursor,
    };
  }
}
