/**
 * Use Case: Calculate Financials (Power 6/55)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * Pipeline:
 *   1. Aggregate revenue + commission per tenant từ DB
 *   2. Aggregate payout summary (giải cố định, winner counts) từ DB
 *   3. Gọi calculateDrawFinancials() để phân bổ:
 *      Revenue → FixedPrizes + Commission + CompanyTake + JackpotContribution
 *   4. Tính dual jackpot: JP1 contribution (90%) + JP2 contribution (10%) + overflow
 *   5. Tính jp1Overflow khi jp1 vượt threshold
 *   6. Ghi kết quả vào DrawDoc (updateSettleResult)
 *
 * Power 6/55 có DUAL JACKPOT:
 *   - JP1 (6/6): tỷ lệ 90% tích luỹ, overflow → JP2 khi vượt threshold
 *   - JP2 (5/6 + bonus): tỷ lệ 10% + overflow từ JP1
 *
 * Power 6/55 KHÔNG có Split Cycle — Jackpot tích lũy không giới hạn đến khi có winner.
 *
 * CRASH-SAFE: Aggregate TẤT CẢ settled entries từ DB.
 * IDEMPOTENT: Chạy lại bao nhiêu lần cũng cho kết quả giống nhau.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier } from "@megawin/game-power655/entities";
import { calculateDrawFinancials, type DrawFinancialInput } from "@megawin/game-power655/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext, SettleFinancials } from "./types";

/**
 * Tính tài chính tổng hợp Power 6/55 từ DB.
 * Hỗ trợ dual jackpot: JP1 (6/6) + JP2 (5/6 + bonus) + overflow mechanism.
 */
export class CalculateFinancialsUseCase extends InternalUseCase<SettleContext, SettleFinancials> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /** @inheritdoc */
  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId, config, jp1OpeningAmount, jp2OpeningAmount } = input;

    // ── Bước 1: Aggregate dữ liệu từ DB ──────────────────────────────
    // tenantAgg: doanh thu + commission per tenant (snapshot lúc place-bet)
    // payoutSummary: giải cố định đã trả + winner counts per tier
    const [tenantAgg, payoutSummary] = await Promise.all([
      this.entryRepo.aggregateRevenueByTenant(drawId),
      this.entryRepo.aggregateSettledPayoutSummary(drawId),
    ]);

    // ── Bước 2: Chuẩn bị input cho calculateDrawFinancials ───────────
    const financialInput: DrawFinancialInput = {
      totalRevenue: tenantAgg.reduce((sum, t) => sum + t.revenue, 0),
      totalFixedPrizes: payoutSummary.totalFixedPrizes,
      tenantRevenues: tenantAgg.map((t) => ({
        tenantId: t.tenantId,
        revenue: t.revenue,
        commission: t.commission,
      })),
      companyRate: config.companyRate,
      jp1Ratio: config.jp1Ratio,
      jp2Ratio: config.jp2Ratio,
      jp1OverflowThreshold: config.jp1OverflowThreshold,
      currentJp1Opening: jp1OpeningAmount,
    };

    // ── Bước 3: Tính phân bổ tài chính ───────────────────────────────
    // Công thức:
    //   totalAgentCommission = Σ(tenant.commission)
    //   companyTake = round(totalRevenue × companyRate)
    //   actualCompanyTake = min(companyTake, max(remainAfterPrizes, 0))
    //   totalJackpotContribution = max(remainAfterPrizes - actualCompanyTake, 0)
    //   jp1Contribution = totalJackpotContribution × jp1Ratio - overflow
    //   jp2Contribution = totalJackpotContribution × jp2Ratio + overflow
    const fin = calculateDrawFinancials(financialInput);

    // ── Bước 4: Xác định có winner JP1/JP2 hay không ─────────────────
    const jp1WinnerCount = payoutSummary.tierWinnerCounts[PrizeTier.Jackpot1] ?? 0;
    const jp2WinnerCount = payoutSummary.tierWinnerCounts[PrizeTier.Jackpot2] ?? 0;
    const hasJackpot1Winner = jp1WinnerCount > 0;
    const hasJackpot2Winner = jp2WinnerCount > 0;

    // ── Bước 5: Ghi kết quả tài chính vào DrawDoc ────────────────────
    await this.drawRepo.updateSettleResult(
      drawId,
      {
        totalRevenue: fin.totalRevenue,
        totalFixedPrizes: fin.totalFixedPrizes,
        totalAgentCommission: fin.totalAgentCommission,
        companyTake: fin.companyTake,
        actualCompanyTake: fin.actualCompanyTake,
        jackpot1Contribution: fin.jackpot1Contribution,
        jackpot2Contribution: fin.jackpot2Contribution,
        jp1Overflow: fin.jp1Overflow,
        tenantBreakdown: tenantAgg.map((t) => ({
          tenantId: t.tenantId,
          revenue: t.revenue,
          commission: t.commission,
          commissionRate: t.commissionRate,
          entryCount: t.entryCount,
        })),
      },
      {
        totalEntries: payoutSummary.totalSettled,
        totalLines: payoutSummary.totalLines,
        totalWinners: 0,
        tierWinners: payoutSummary.tierWinnerCounts,
        totalPayout: payoutSummary.totalPayoutAmount,
      },
    );

    return {
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
      actualCompanyTake: fin.actualCompanyTake,
      jackpot1Contribution: fin.jackpot1Contribution,
      jackpot2Contribution: fin.jackpot2Contribution,
      jp1Overflow: fin.jp1Overflow,
      hasJackpot1Winner,
      hasJackpot2Winner,
    };
  }
}
