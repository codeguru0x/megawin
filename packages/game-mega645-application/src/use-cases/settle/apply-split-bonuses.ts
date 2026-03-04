/**
 * Use Case: Apply Split Bonuses (Mega 6/45)
 *
 * Patch bonusPerWinner từ Jackpot split vào entry payout.tiers + payout amounts.
 * Chỉ chạy khi isSplitCycle = true.
 * IDEMPOTENT: Check isSplitBonus=true trên tier — nếu đã patch thì skip.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface ApplySplitBonusesInput {
  /** ID kỳ quay đang settle. */
  drawId: string;
  /** Kỳ này có thực hiện split jackpot không. */
  isSplitCycle: boolean;
  /**
   * Chi tiết chia jackpot theo hạng (chỉ cần khi isSplitCycle = true).
   * Key = tier (e.g. "tier2"), value = thông tin chia.
   */
  splitDetails?: Record<
    string,
    {
      /** Số tiền ban đầu phân bổ cho hạng (VND). */
      initialAmount: number;
      /** Số tiền tái phân phối từ hạng không có người trúng (VND). */
      redistributedAmount: number;
      /** Tổng tiền hạng = initialAmount + redistributedAmount (VND). */
      totalAmount: number;
      /** Số người trúng hạng này. */
      winnerCount: number;
      /** Tiền thưởng mỗi người = totalAmount / winnerCount (VND). */
      bonusPerWinner: number;
    }
  >;
}

export interface ApplySplitBonusesResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Số entry đã được patch thêm split bonus. */
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
