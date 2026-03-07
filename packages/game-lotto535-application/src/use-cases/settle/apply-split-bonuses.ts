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
 * KHI NÀO SKIP (trả skipped = true):
 * ────────────────────────────────────────────────
 *   1. Không phải kỳ chia thưởng (isSplitCycle = false):
 *      - JP chưa đạt ngưỡng splitThreshold, hoặc không phải kỳ Evening.
 *
 *   2. Là kỳ chia nhưng CÓ người trúng Jackpot (5 main + special):
 *      - Theo luật Vietlott, JP winner overrides split — winner nhận toàn bộ JP pool.
 *      - CalculateFinancials KHÔNG tính splitDetails → splitDetails = undefined.
 *
 *   3. Là kỳ chia nhưng KHÔNG ai trúng bất kỳ giải nào (tier1-tier5 đều 0 winner):
 *      - Không có ai để chia → splitDetails = {} (empty object).
 *      - JP giữ nguyên, tích luỹ tiếp sang kỳ sau.
 *
 * ────────────────────────────────────────────────
 * KHI NÀO CHẠY:
 * ────────────────────────────────────────────────
 *   isSplitCycle = true + không có JP winner + có ít nhất 1 winner tier1-tier5:
 *     → splitDetails chứa chi tiết phân bổ theo tier.
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
import type { SettleContext } from "./types";

/**
 * Kết quả bước ApplySplitBonuses.
 * Step Function KHÔNG sử dụng output này (không có Assign).
 * Giữ lại để debug qua CloudWatch / Step Function execution history.
 */
export interface ApplySplitBonusesResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Số entries đã được patch thêm split bonus. */
  entriesPatched: number;
  /** true nếu bỏ qua (không phải split cycle hoặc không có splitDetails). */
  skipped: boolean;
}

export class ApplySplitBonusesUseCase extends InternalUseCase<
  SettleContext,
  ApplySplitBonusesResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: SettleContext): Promise<ApplySplitBonusesResult> {
    const { drawId, isSplitCycle } = input;
    const splitDetails = input.financials?.splitDetails;

    // ── Guard: skip khi không cần chia split bonus ──
    // 3 trường hợp skip:
    //   1. !isSplitCycle: không phải kỳ chia (JP < threshold hoặc không phải Evening)
    //   2. !splitDetails: có JP winner → winner nhận hết, không split (undefined)
    //   3. empty splitDetails: không ai trúng tier1-tier5 (không ai để chia)
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
      //   Filter chỉ scan entries THẮNG (outcome = "win") + trúng tier cụ thể.
      //   → Loại bỏ ~90% entries thua ngay từ index, không cần quét array payout.tiers.
      //   $nor guard idempotent: bỏ qua entry đã được patch split bonus cho tier này.
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
