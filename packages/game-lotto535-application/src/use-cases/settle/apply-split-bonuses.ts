/**
 * Use Case: Apply Split Bonuses (Lotto 5/35)
 *
 * Patch bonusPerWinner từ Jackpot split vào entry payout.tiers + payout amounts.
 * Chạy SAU CalculateFinancials, TRƯỚC SyncTicketSummaries.
 *
 * Chỉ chạy khi isSplitCycle = true.
 *
 * IDEMPOTENT: Check isSplitBonus=true trên tier — nếu đã patch thì skip.
 * Lines KHÔNG bị update (giữ immutable) — split bonus chỉ ở mức entry.
 *
 * Input: { drawId, splitDetails, isSplitCycle }
 * Output: { drawId, entriesPatched }
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryStatus } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-lotto535/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { LottoSplitDetails } from "./types";

export interface ApplySplitBonusesInput {
  /** Mã kỳ quay. */
  drawId: string;
  /** Kỳ này có phải kỳ chia Jackpot hay không. Nếu false → skip. */
  isSplitCycle: boolean;
  /** Chi tiết phân bổ split theo tier — từ CalculateFinancials. */
  splitDetails?: LottoSplitDetails;
}

export interface ApplySplitBonusesResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Số entries đã được patch thêm split bonus. */
  entriesPatched: number;
  /** true nếu bỏ qua (không phải split cycle hoặc không có splitDetails). */
  skipped: boolean;
}

export class ApplySplitBonusesUseCase extends InternalUseCase<
  ApplySplitBonusesInput,
  ApplySplitBonusesResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(
    input: ApplySplitBonusesInput
  ): Promise<ApplySplitBonusesResult> {
    const { drawId, isSplitCycle, splitDetails } = input;

    if (
      !isSplitCycle ||
      !splitDetails ||
      Object.keys(splitDetails).length === 0
    ) {
      return { drawId, entriesPatched: 0, skipped: true };
    }

    let entriesPatched = 0;

    for (const [tier, detail] of Object.entries(splitDetails)) {
      if (detail.bonusPerWinner <= 0 || detail.winnerCount <= 0) continue;

      const patched = await this.entryRepo.applySplitBonusForTier(
        drawId,
        tier,
        detail.bonusPerWinner
      );
      entriesPatched += patched;
    }

    return { drawId, entriesPatched, skipped: false };
  }
}
