/**
 * Use Case: Apply Split Bonuses (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 4b TRONG SETTLE FLOW — CHỈ CHẠY KHI SPLIT CYCLE CÓ WINNER
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Step Function route vào đây khi:
 *   - financials.hasJackpotWinner = false (không có ai trúng JP)
 *   - isSplitCycle = true (Jackpot >= splitThreshold, kỳ Evening)
 *   - financials.splitDetails tồn tại (có winner tier1-tier5)
 *
 * ────────────────────────────────────────────────
 * SPLIT CYCLE LÀ GÌ:
 * ────────────────────────────────────────────────
 *   Khi quỹ Jackpot >= 12 tỷ (splitThreshold) và không ai trúng JP,
 *   hệ thống chia quỹ JP cho những người trúng tier1-tier5.
 *   Mục đích: tránh Jackpot tích luỹ quá lớn, trả thưởng cho người chơi.
 *
 * ────────────────────────────────────────────────
 * LOGIC:
 * ────────────────────────────────────────────────
 *
 *   splitDetails (đã tính sẵn bởi CalculateFinancials) chứa:
 *   - Mỗi tier (tier1-tier5): { bonusPerWinner, winnerCount, totalAmount }
 *   - Tỷ lệ: tier1 = 2/6 quỹ JP, tier2-tier5 = mỗi tier 1/6
 *   - Tier không có winner → phần tiền tái phân bổ cho tier có winner
 *   - bonusPerWinner đã làm tròn xuống 5.000 VND
 *
 *   Bước xử lý:
 *   1. Duyệt qua từng tier trong splitDetails
 *   2. Với mỗi tier có bonusPerWinner > 0 và winnerCount > 0:
 *      → Patch entry.payout: thêm 1 tier mới { tier, isSplitBonus: true }
 *      → Cộng bonusPerWinner vào entry.payout.winAmount + payoutAmount
 *   3. Trả tổng số entries đã patch
 *
 * ────────────────────────────────────────────────
 * KHÁC BIỆT VỚI JACKPOT PRIZE:
 * ────────────────────────────────────────────────
 *   - Split bonus = thêm tier MỚI (isSplitBonus: true) vào entry.payout.tiers
 *   - Jackpot prize = update tier HIỆN CÓ (jackpot tier đã ghi lúc SettleEntries)
 *   - Split KHÔNG update lines (bonus ghi mức entry, không phải mức line)
 *   - Jackpot CẬP NHẬT lines (line.matchResult.winAmount)
 *
 * ────────────────────────────────────────────────
 * IDEMPOTENT:
 * ────────────────────────────────────────────────
 *   - applySplitBonusForTier: filter entry chưa có tier với isSplitBonus = true
 *     → nếu đã patch thì skip (không duplicate)
 *   - Dùng $addToSet hoặc conditional filter để tránh ghi đè
 *
 * Input: SettleContext (đã có financials + splitDetails)
 * Output: { drawId, entriesPatched }
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { SettleContext } from "./types";

export interface ApplySplitBonusesResult {
  drawId: string;
  entriesPatched: number;
}

export class ApplySplitBonusesUseCase extends InternalUseCase<
  SettleContext,
  ApplySplitBonusesResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();

  protected async execute(input: SettleContext): Promise<ApplySplitBonusesResult> {
    const { drawId } = input;
    const splitDetails = input.financials?.splitDetails;

    // Guard: Step Function đảm bảo chỉ route vào đây khi splitDetails tồn tại.
    // Double-check phòng trường hợp config sai hoặc test gọi trực tiếp.
    if (!splitDetails || Object.keys(splitDetails).length === 0) {
      return { drawId, entriesPatched: 0 };
    }

    let entriesPatched = 0;

    // ── Duyệt từng tier, patch split bonus vào entries trúng tier đó ──
    // splitDetails key = tier name (tier1-tier5), value = { bonusPerWinner (= bonusPerUnit), winnerCount, ... }
    for (const [tier, detail] of Object.entries(splitDetails)) {
      // Skip tier không có winner hoặc bonus = 0 (có thể do làm tròn)
      if (detail.bonusPerWinner <= 0 || detail.winnerCount <= 0) continue;

      // Lấy winning lines cho tier này để build betUnitsByEntry map.
      // betUnits per entry = Σ betCount của các lines thuộc entry trúng tier đó.
      // Cần thiết vì split bonus chia theo tỷ lệ tham gia dự thưởng (betCount).
      const tierLines = await this.lineRepo.getWinningLinesForTier(drawId, tier);
      const betUnitsByEntry = new Map<string, number>();
      for (const line of tierLines) {
        const entryIdStr = line.entryId?.toString() ?? "";
        if (!entryIdStr) continue;
        betUnitsByEntry.set(
          entryIdStr,
          (betUnitsByEntry.get(entryIdStr) ?? 0) + line.betCount,
        );
      }

      // applySplitBonusForTier: thêm tier { isSplitBonus: true } vào payout.tiers
      // và $inc winAmount + payoutAmount. Idempotent: chỉ patch entry chưa có tier này.
      // bonusPerWinner = bonusPerUnit (vì calculateSplitDistribution nhận tierBetUnitCounts)
      const patched = await this.entryRepo.applySplitBonusForTier(
        drawId,
        tier,
        detail.bonusPerWinner,
        betUnitsByEntry,
      );
      entriesPatched += patched;
    }

    return { drawId, entriesPatched };
  }
}
