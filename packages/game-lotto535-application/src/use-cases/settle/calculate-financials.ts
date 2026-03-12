/**
 * Use Case: Calculate Financials (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 3 TRONG SETTLE FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 * Đây là bước tính toán thuần tuý từ DB — KHÔNG dựa vào accumulator.
 *
 * ────────────────────────────────────────────────
 * CÁC BƯỚC TÍNH TOÁN:
 * ────────────────────────────────────────────────
 *
 *   1. AGGREGATE TỪ DB (song song):
 *      - settleSummary: tất cả entries SETTLED trong kỳ (1 pipeline $facet).
 *        Gồm: tierWinnerCounts, totalFixedPrizes, totalSettled, totalPayoutAmount, totalLines.
 *      - tenantAgg: tất cả entries KHÔNG VOID — doanh thu + commission theo từng tenant.
 *
 *   2. TÍNH TÀI CHÍNH (calculateDrawFinancials):
 *      - totalRevenue       = Σ revenue các tenant
 *      - totalAgentCommission = Σ commission các tenant
 *      - companyTake        = companyRate × totalRevenue (15% mặc định)
 *      - remainAfterPrizes  = revenue - fixedPrizes - commission
 *      - actualCompanyTake  = min(companyTake, max(remainAfterPrizes, 0))
 *      - jackpotContribution = max(remainAfterPrizes - actualCompanyTake, 0)
 *
 *      Ý nghĩa: Doanh thu phân bổ theo thứ tự ưu tiên:
 *        ① Trả giải cố định (fixedPrizes)
 *        ② Trả commission đại lý
 *        ③ Công ty thu về (tối đa 15% tổng doanh thu)
 *        ④ Phần còn lại → tích luỹ vào quỹ Jackpot
 *
 *   3. TÍNH SPLIT (chỉ khi isSplitCycle = true VÀ không có JP winner):
 *      - Khi Jackpot >= 12 tỷ (splitThreshold), hệ thống chia JP cho người thắng
 *      - Tỷ lệ chia: tier1 = 2/6, tier2-tier5 = mỗi tier 1/6
 *      - Tier không có winner → phần tiền đó tái phân bổ cho các tier có winner
 *      - Bonus làm tròn xuống 5.000 VND (trừ tier cao nhất nhận phần dư)
 *      - consolation KHÔNG tham gia chia Jackpot
 *
 *   5. GHI draw.financial VÀO DB (overwrite — idempotent)
 *
 * ────────────────────────────────────────────────
 * CRASH-SAFE:
 * ────────────────────────────────────────────────
 *   - KHÔNG dựa vào accumulator từ step function (có thể mất khi crash)
 *   - Aggregate TẤT CẢ settled entries từ DB → tính chính xác
 *   - Ghi draw.financial = overwrite → chạy lại cho kết quả giống nhau
 *
 * IDEMPOTENT: Chạy lại bao nhiêu lần cũng cho kết quả giống nhau.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier, type DrawTierPrizeSummary } from "@megawin/game-lotto535/entities";
import {
  calculateDrawFinancials,
  calculateSplitDistribution,
  type DrawFinancialInput,
} from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext, SettleFinancials } from "./types";

export class CalculateFinancialsUseCase extends InternalUseCase<SettleContext, SettleFinancials> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /** Tính tài chính tổng hợp từ DB. Idempotent. */
  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId, config, jackpotOpeningAmount, isSplitCycle } = input;

    // ── BƯỚC 1: Aggregate dữ liệu từ DB (song song) ──
    // Chạy 2 pipeline song song trên 2 tập dữ liệu KHÁC NHAU:
    //
    //   settleSummary: tất cả entries SETTLED trong kỳ.
    //     → 1 pipeline $facet duy nhất (scan 1 lần) thay vì 3 pipeline riêng trước đây.
    //     → Trả về: tierWinnerCounts, totalFixedPrizes, totalSettled, totalPayoutAmount, totalLines.
    //
    //   tenantAgg: tất cả entries KHÔNG VOID (bao gồm cả scheduled chưa settle nếu có).
    //     → Group by null → totalRevenue + totalAgentCommission (2 scalars).
    const [settleSummary, { totalRevenue, totalAgentCommission }] = await Promise.all([
      this.entryRepo.aggregateSettleSummary(drawId),
      this.entryRepo.aggregateTotalRevenue(drawId),
    ]);

    // ── BƯỚC 2: Tính tài chính kỳ quay ──
    // calculateDrawFinancials thực hiện phân bổ doanh thu:
    //   totalRevenue → fixedPrizes → commission → companyTake → jackpotContribution
    //
    // Công thức:
    //   companyTake = companyRate × totalRevenue (VD: 15% × 10 tỷ = 1.5 tỷ)
    //   remainAfterPrizes = totalRevenue - totalFixedPrizes - totalCommission
    //   actualCompanyTake = min(companyTake, max(remainAfterPrizes, 0))
    //   jackpotContribution = max(remainAfterPrizes - actualCompanyTake, 0)
    //
    // Nếu doanh thu không đủ trả giải + commission:
    //   → actualCompanyTake = 0, jackpotContribution = 0
    //   (công ty chịu lỗ, Jackpot không nhận đóng góp)
    const financialInput: DrawFinancialInput = {
      totalRevenue,
      totalFixedPrizes: settleSummary.totalFixedPrizes,
      totalAgentCommission,
      companyRate: config.companyRate,
    };

    const fin = calculateDrawFinancials(financialInput);

    // ── BƯỚC 3: Kiểm tra có ai trúng Jackpot không ──
    // jackpotWinnerCount: đếm số entries có tier = "jackpot" (5 main + special)
    const jackpotWinnerCount = settleSummary.tierWinnerCounts[PrizeTier.Jackpot] ?? 0;
    const hasJackpotWinner = jackpotWinnerCount > 0;

    // ── BƯỚC 4: Tính split distribution (chỉ khi isSplitCycle VÀ không có JP winner) ──
    // Split chỉ xảy ra khi không ai trúng Jackpot (theo luật Vietlott).
    // Nếu có JP winner → winner nhận toàn bộ JP, không split.
    let splitDetails: SettleFinancials["splitDetails"];

    if (isSplitCycle && !hasJackpotWinner) {
      // Đếm winner theo tier (bỏ qua Jackpot và Consolation)
      const winnerCountPerTier = new Map<PrizeTier, number>();
      for (const [tierStr, count] of Object.entries(settleSummary.tierWinnerCounts)) {
        if (tierStr === PrizeTier.Jackpot || tierStr === PrizeTier.Consolation) continue;
        if (count > 0) winnerCountPerTier.set(tierStr as PrizeTier, count);
      }

      // calculateSplitDistribution:
      //   Input: jackpotAmount, splitRatios {tier1:2, tier2:1, tier3:1, tier4:1, tier5:1}
      //   1. Tính tổng ratios = 6
      //   2. Mỗi tier được phần: jackpotAmount × (ratio / totalRatios)
      //   3. Tier không có winner → gom lại thành "unallocated pool"
      //   4. Tái phân bổ pool cho các tier có winner (theo tỷ lệ)
      //   5. bonusPerWinner = totalAmount / winnerCount (làm tròn xuống 5.000 VND)
      const splitResult = calculateSplitDistribution({
        jackpotAmount: jackpotOpeningAmount,
        splitRatios: config.splitRatios,
        winnerCountPerTier,
      });

      if (splitResult.details.size > 0) {
        splitDetails = {};
        for (const [tier, detail] of splitResult.details) {
          splitDetails[tier] = {
            initialAmount: detail.initialAmount,
            redistributedAmount: detail.redistributedAmount,
            totalAmount: detail.totalAmount,
            winnerCount: detail.winnerCount,
            bonusPerWinner: detail.bonusPerWinner,
          };
        }
      }
    }

    // ── BƯỚC 5+6: Ghi financial + stats + settleSummary vào draw (1 DB call) ──
    // settleSummary denormalize bảng giải thưởng cho player API.
    // Jackpot tier prizeAmount = 0 ở đây — PatchJackpotPrize (step 4a) sẽ patch sau.
    const tiers: DrawTierPrizeSummary[] = [];

    for (const tier of Object.values(PrizeTier)) {
      const winnerCount = settleSummary.tierWinnerCounts[tier] ?? 0;
      if (winnerCount === 0) continue;

      const unitAmount = input.prizeAmounts[tier] ?? 0;
      tiers.push({
        tier,
        winnerCount,
        prizeAmount: unitAmount * winnerCount,
      });
    }

    await this.drawRepo.updateSettleResult(
      drawId,
      {
        totalRevenue: fin.totalRevenue,
        totalFixedPrizes: fin.totalFixedPrizes,
        totalAgentCommission: fin.totalAgentCommission,
        companyTake: fin.companyTake,
        companyTakeRate: config.companyRate,
        actualCompanyTake: fin.actualCompanyTake,
        jackpotContribution: fin.jackpotContribution,
      },
      {
        ticketEntryCount: settleSummary.totalSettled,
        totalLineCount: settleSummary.totalLines,
        totalSalesAmount: fin.totalRevenue,
        totalPayoutAmount: settleSummary.totalPayoutAmount,
      },
      { tiers },
    );

    return {
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
      actualCompanyTake: fin.actualCompanyTake,
      jackpotContribution: fin.jackpotContribution,
      hasJackpotWinner,
      splitDetails,
    };
  }
}
