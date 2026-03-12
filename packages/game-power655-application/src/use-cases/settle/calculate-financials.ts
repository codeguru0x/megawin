/**
 * Use Case: Calculate Financials (Power 6/55)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * Pipeline:
 *   1. Aggregate revenue + commission per tenant từ DB
 *   2. Aggregate payout summary (giải cố định, winner counts) từ DB
 *   3. Xác định hasJackpot1Winner + hasJackpot2Winner từ winner counts
 *      → Phải biết trước khi tính tài chính vì overflow rule phụ thuộc hasJackpot2Winner
 *   4. Gọi calculateDrawFinancials() để phân bổ:
 *      Revenue → FixedPrizes + Commission + CompanyTake + JackpotContribution
 *   5. Tính dual jackpot: JP1 contribution (90%) + JP2 contribution (10%) + overflow
 *   6. Overflow conditional (theo thể lệ Vietlott):
 *      - Có JP2 winner → jp1Overflow chuyển sang JP2 (trao kỳ này)
 *      - Không có JP2 winner → jp1Overflow trả về JP1 kỳ tiếp (JP2 không thay đổi)
 *   7. Ghi kết quả vào DrawDoc (updateSettleResult)
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
import type { DrawSettleSummary, DrawSettleSummaryTier } from "@megawin/game-power655/entities";
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
    const { drawId, config, jp1CurrentAmount, jp2CurrentAmount } = input;

    // ── Bước 1: Aggregate dữ liệu từ DB ──────────────────────────────
    // tenantAgg: doanh thu + commission per tenant (snapshot lúc place-bet)
    // payoutSummary: giải cố định đã trả + winner counts per tier
    const [{ totalRevenue, totalAgentCommission }, payoutSummary] = await Promise.all([
      this.entryRepo.aggregateTotalRevenue(drawId),
      this.entryRepo.aggregateSettledPayoutSummary(drawId),
    ]);

    // ── Bước 2: Xác định có winner JP1/JP2 hay không ──────────────────
    // Phải biết hasJackpot2Winner TRƯỚC khi gọi calculateDrawFinancials
    // vì overflow rule phụ thuộc vào việc có JP2 winner kỳ này không.
    const jp1WinnerCount = payoutSummary.tierWinnerCounts[PrizeTier.Jackpot1] ?? 0;
    const jp2WinnerCount = payoutSummary.tierWinnerCounts[PrizeTier.Jackpot2] ?? 0;
    const hasJackpot1Winner = jp1WinnerCount > 0;
    const hasJackpot2Winner = jp2WinnerCount > 0;

    // ── Bước 3: Chuẩn bị input cho calculateDrawFinancials ───────────
    const financialInput: DrawFinancialInput = {
      totalRevenue,
      totalFixedPrizes: payoutSummary.totalFixedPrizes,
      totalAgentCommission,
      companyRate: config.companyRate,
      jp1Ratio: config.jp1Ratio,
      jp2Ratio: config.jp2Ratio,
      jp1OverflowThreshold: config.jp1OverflowThreshold,
      jp1CurrentAmount: jp1CurrentAmount,
      // Overflow rule (thể lệ Vietlott):
      //   Có JP1 winner → overflow KHÔNG kích hoạt; JP1 winner nhận toàn bộ projectedJp1.
      //   Không có JP1 winner + có JP2 winner → jp1Overflow chuyển sang JP2 (trao kỳ này).
      //   Không có JP1 winner + không có JP2 winner → jp1Overflow trả về JP1 kỳ tiếp.
      hasJackpot1Winner,
      hasJackpot2Winner,
    };

    // ── Bước 4: Tính phân bổ tài chính ───────────────────────────────
    // Công thức:
    //   totalAgentCommission = Σ(tenant.commission)
    //   companyTake = round(totalRevenue × companyRate)
    //   actualCompanyTake = min(companyTake, max(remainAfterPrizes, 0))
    //   totalJackpotContribution = max(remainAfterPrizes - actualCompanyTake, 0)
    //   jp1Contribution = totalJackpotContribution × jp1Ratio - overflow
    //   jp2Contribution = totalJackpotContribution × jp2Ratio [+ overflow nếu hasJackpot2Winner]
    const fin = calculateDrawFinancials(financialInput);

    // ── Bước 5: Ghi kết quả tài chính + settleSummary vào DrawDoc ─────
    // settleSummary.tiers: tất cả 5 tiers, JP = 0 tại đây.
    // FinalizeSettle sẽ patch prizeAmount JP1/JP2 sau khi biết pool + winners.
    const ALL_TIERS = [
      PrizeTier.Jackpot1,
      PrizeTier.Jackpot2,
      PrizeTier.Tier1,
      PrizeTier.Tier2,
      PrizeTier.Tier3,
    ] as const;

    const settleSummaryTiers: DrawSettleSummaryTier[] = ALL_TIERS.map((tier) => ({
      tier,
      winnerCount: payoutSummary.tierWinnerCounts[tier] ?? 0,
      // JP1/JP2: prizeAmount = 0 tại đây; FinalizeSettle patch sau khi biết pool.
      prizeAmount: payoutSummary.tierPrizeAmounts[tier] ?? 0,
    }));

    const settleSummary: DrawSettleSummary = { tiers: settleSummaryTiers };

    await this.drawRepo.updateSettleResult(
      drawId,
      {
        totalRevenue: fin.totalRevenue,
        totalFixedPrizes: fin.totalFixedPrizes,
        totalAgentCommission: fin.totalAgentCommission,
        companyTake: fin.companyTake,
        companyTakeRate: config.companyRate,
        actualCompanyTake: fin.actualCompanyTake,
        jackpot1Contribution: fin.jackpot1Contribution,
        jackpot2Contribution: fin.jackpot2Contribution,
        jp1Overflow: fin.jp1Overflow,
      },
      {
        ticketEntryCount: payoutSummary.totalSettled,
        totalLineCount: payoutSummary.totalLines,
        totalSalesAmount: totalRevenue,
        totalPayoutAmount: payoutSummary.totalPayoutAmount,
      },
      settleSummary,
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
    } as SettleFinancials;
  }
}
