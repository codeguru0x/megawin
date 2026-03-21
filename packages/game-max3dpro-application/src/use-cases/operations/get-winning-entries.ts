import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-max3dpro/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningEntryItem,
  WinningEntriesSummary,
  WinningEntryTierDetail,
  WinningEntryBoard,
} from "./dto/winning-entries.dto";

/** Label tiếng Việt cho 8 hạng giải Max 3D Pro. */
const TIER_LABELS: Record<string, string> = {
  [PrizeTier.Special]: "Giải Đặc Biệt",
  [PrizeTier.SpecialSub]: "Giải phụ Đặc Biệt",
  [PrizeTier.First]: "Giải Nhất",
  [PrizeTier.Second]: "Giải Nhì",
  [PrizeTier.Third]: "Giải Ba",
  [PrizeTier.Fourth]: "Giải Tư",
  [PrizeTier.Fifth]: "Giải Năm",
  [PrizeTier.Sixth]: "Giải Sáu",
};

/**
 * Lấy danh sách entries trúng thưởng của 1 kỳ quay Max 3D Pro.
 *
 * Chỉ trả về entries đã settle và có winAmount > 0.
 * Max 3D Pro đặc thù:
 * - 1 PrizeTier enum duy nhất (8 hạng, bao gồm specialSub).
 * - isDuplicate: 2 bộ ba trong 1 cặp giống nhau → giải thưởng × 2.
 * - multiDigit board có frontDigits + backDigits.
 */
export class GetWinningEntriesUseCase extends NextApiUseCase<
  GetWinningEntriesInput,
  GetWinningEntriesOutput
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: GetWinningEntriesInput): Promise<GetWinningEntriesOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    const limit = Math.min(input.limit ?? 50, 200);
    const cursorId = input.cursor ?? undefined;

    const [entries, summary] = await Promise.all([
      this.entryRepo.getWinningEntries(input.drawId, limit, cursorId),
      this.entryRepo.getWinningEntriesSummary(input.drawId),
    ]);

    const items: WinningEntryItem[] = entries.map((e) => {
      const payoutTiers = (e.payout?.tiers ?? []).filter((t) => t.hitCount > 0);

      const tiers: WinningEntryTierDetail[] = payoutTiers.map((t) => ({
        tier: t.tier,
        tierLabel: TIER_LABELS[t.tier] ?? t.tier,
        hitCount: t.hitCount,
        unitAmount: t.unitAmount,
        amount: t.amount,
      }));

      const boards: WinningEntryBoard[] = (e.entrySummary?.boards ?? []).map((b) => {
        // Max 3D Pro: isDuplicate khi tất cả P(n,2) ordered pairs từ 1 bộ ba giống nhau
        // Với multiNumber: chỉ có thể duplicate khi đúng 2 bộ ba trong board và giống nhau
        const isDuplicate =
          b.playMode === "multiNumber" && b.triplets.length === 2
            ? b.triplets[0] === b.triplets[1]
            : undefined;

        return {
          boardNo: b.boardNo,
          playMode: b.playMode,
          playType: b.playType,
          triplets: b.triplets,
          frontDigits: b.frontDigits,
          backDigits: b.backDigits,
          lineCount: b.lineCount,
          // betCount fallback sang 1 cho entries cũ.
          betCount: b.betCount ?? 1,
          isDuplicate,
        };
      });

      return {
        entryId: e.id,
        username: e.username,
        tenantId: e.tenantId,
        lineCount: e.lineCount,
        // betUnitCount fallback sang lineCount cho entries cũ.
        betUnitCount: e.betUnitCount ?? e.lineCount,
        amount: e.amount,
        winAmount: e.payout?.winAmount ?? 0,
        boards,
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
