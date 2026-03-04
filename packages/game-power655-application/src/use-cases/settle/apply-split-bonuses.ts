/**
 * Use Case: Apply Split Bonuses (Power 6/55)
 *
 * Patch bonusPerWinner từ Jackpot split vào entry payout.tiers + payout amounts.
 * Chạy SAU CalculateFinancials, TRƯỚC SyncTicketSummaries.
 *
 * Chỉ chạy khi isSplitCycle = true.
 *
 * IDEMPOTENT: Check isSplitBonus=true trên tier — nếu đã patch thì skip.
 * Lines KHÔNG bị update (giữ immutable) — split bonus chỉ ở mức entry.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryStatus } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-power655/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { PowerSplitDetails } from "./types";

export interface ApplySplitBonusesInput {
  /** ID kỳ quay cần patch split bonus. */
  drawId: string;
  /** Có phải kỳ chia giải (split cycle) hay không. Nếu false → skip toàn bộ. */
  isSplitCycle: boolean;
  /** Chi tiết chia giải theo tier (từ CalculateFinancials). */
  splitDetails?: PowerSplitDetails;
}

export interface ApplySplitBonusesResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Số entries đã được patch thêm split bonus. */
  entriesPatched: number;
  /** true nếu bỏ qua (không phải split cycle hoặc không có splitDetails). */
  skipped: boolean;
}

/**
 * Patch split bonus vào entries thắng giải cố định.
 * Chỉ chạy khi kỳ quay là split cycle (tổng JP vượt ngưỡng).
 */
export class ApplySplitBonusesUseCase extends InternalUseCase<
  ApplySplitBonusesInput,
  ApplySplitBonusesResult
> {
  private readonly entryRepo = new EntryRepository();

  /** @inheritdoc */
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
