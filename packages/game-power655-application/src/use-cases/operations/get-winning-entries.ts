import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { Pagination } from "@megawin/shared/constants/pagination";
import { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-power655/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type {
  GetWinningEntriesInput,
  GetWinningEntriesOutput,
  WinningEntryItem,
  WinningEntriesSummary,
} from "./dto/winning-entries.dto";

const TIER_LABELS: Record<string, string> = {
  [PrizeTier.Jackpot1]: "Jackpot 1",
  [PrizeTier.Jackpot2]: "Jackpot 2",
  [PrizeTier.Tier1]: "Giải Nhất",
  [PrizeTier.Tier2]: "Giải Nhì",
  [PrizeTier.Tier3]: "Giải Ba",
};

/**
 * Lấy danh sách entries trúng thưởng của 1 kỳ quay Power 6/55.
 *
 * Chỉ trả về entries đã settle và có winAmount > 0.
 * Kèm summary tổng hợp (totalWinningEntries, totalWinningLines, totalWinAmount).
 * Dùng cho dialog báo cáo trúng thưởng trên trang operations backoffice.
 *
 * Power 6/55: 6 tiers (jackpot1, jackpot2, tier1-4), có bonus number trong result.
 */
export class GetWinningEntriesUseCase extends NextApiUseCase<GetWinningEntriesInput, GetWinningEntriesOutput> {
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
      return {
        entryId: e.id,
        username: e.username,
        tenantId: e.tenantId,
        lineCount: e.lineCount,
        amount: e.amount,
        winAmount: e.payout?.winAmount ?? 0,
        boards: (e.entrySummary?.boards ?? []).map((b) => ({
          boardNo: b.boardNo,
          playType: b.playType,
          mainNumbers: b.mainNumbers,
          expandedLines: b.expandedLines,
        })),
        winningMain: e.result?.winningMain ?? [],
        bonusNumber: e.result?.bonusNumber ?? "",
        tiers: payoutTiers.map((t) => ({
          tier: t.tier,
          tierLabel: TIER_LABELS[t.tier] ?? t.tier,
          hitCount: t.hitCount,
          unitAmount: t.unitAmount,
          amount: t.amount,
        })),
        createdAt: e.createdAt.toISOString(),
        settledAt: (e.payout?.settledAt ?? e.updatedAt).toISOString(),
      };
    });

    const nextCursor = entries.length === limit ? (entries[entries.length - 1]?.id ?? null) : null;

    return {
      drawId: input.drawId,
      entries: items,
      summary: summary as WinningEntriesSummary,
      nextCursor,
    };
  }
}
