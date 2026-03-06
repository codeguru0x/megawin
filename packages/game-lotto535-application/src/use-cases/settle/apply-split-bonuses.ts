/**
 * Use Case: Apply Split Bonuses (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 4 TRONG SETTLE FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Patch bonusPerWinner từ Jackpot split vào entry.payout.tiers + payout amounts.
 * Chạy SAU CalculateFinancials (đã có splitDetails), TRƯỚC SyncTicketSummaries.
 *
 * ────────────────────────────────────────────────
 * KHI NÀO CHẠY:
 * ────────────────────────────────────────────────
 *   - Chỉ chạy khi isSplitCycle = true (Jackpot >= splitThreshold, mặc định 12 tỷ)
 *   - Nếu isSplitCycle = false → skip ngay, trả skipped = true
 *
 * ────────────────────────────────────────────────
 * LOGIC:
 * ────────────────────────────────────────────────
 *   Duyệt từng tier trong splitDetails:
 *     - Nếu tier có bonusPerWinner > 0 VÀ winnerCount > 0:
 *       → entryRepo.applySplitBonusForTier(drawId, tier, bonusPerWinner)
 *       → Tìm entries có payout.tiers[].tier = tier && isSplitBonus != true
 *       → Patch: thêm split bonus amount vào payout.winAmount + payout.payoutAmount
 *       → Ghi flag isSplitBonus = true lên tier entry (để idempotent)
 *
 *   Ví dụ (JP = 12 tỷ, tier1 ratio = 2/6 = 4 tỷ, 2 winners):
 *     → bonusPerWinner = 4.000.000.000 / 2 = 2.000.000.000 VND mỗi người
 *     → Mỗi entry trúng tier1 được patch thêm 2 tỷ vào payout
 *
 * ────────────────────────────────────────────────
 * IDEMPOTENT:
 * ────────────────────────────────────────────────
 *   Check isSplitBonus = true trên tier — nếu entry đã patch rồi thì skip.
 *   Lines KHÔNG bị update (giữ immutable) — split bonus chỉ ở mức entry payout.
 *
 * Input: { drawId, splitDetails, isSplitCycle }
 * Output: { drawId, entriesPatched, skipped }
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
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

  protected async execute(input: ApplySplitBonusesInput): Promise<ApplySplitBonusesResult> {
    const { drawId, isSplitCycle, splitDetails } = input;

    // ── Guard: skip nếu không phải kỳ chia hoặc không có dữ liệu split ──
    if (!isSplitCycle || !splitDetails || Object.keys(splitDetails).length === 0) {
      return { drawId, entriesPatched: 0, skipped: true };
    }

    let entriesPatched = 0;

    // ── Duyệt từng tier được phân bổ tiền Jackpot ──
    // splitDetails chỉ chứa tier1-tier5 có winner (consolation không tham gia).
    // Mỗi tier có: initialAmount, redistributedAmount, totalAmount, winnerCount, bonusPerWinner
    for (const [tier, detail] of Object.entries(splitDetails)) {
      if (detail.bonusPerWinner <= 0 || detail.winnerCount <= 0) continue;

      // applySplitBonusForTier:
      //   - Query entries: drawId, payout.tiers[].tier = tier, isSplitBonus != true
      //   - Patch: payout.winAmount += bonusPerWinner, payout.payoutAmount += bonusPerWinner
      //   - Set isSplitBonus = true trên tier item (idempotent guard)
      const patched = await this.entryRepo.applySplitBonusForTier(
        drawId,
        tier,
        detail.bonusPerWinner,
      );
      entriesPatched += patched;
    }

    return { drawId, entriesPatched, skipped: false };
  }
}
