/**
 * Use Case: Calculate Financials (Mega 6/45)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TỔNG QUAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 * Aggregate trực tiếp từ DB — CRASH-SAFE và IDEMPOTENT.
 *
 * Mega 6/45 theo luật Vietlott: không có Split Cycle.
 * Jackpot chỉ roll-over (tích luỹ) hoặc trao toàn bộ cho winner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT CLOSING
 * ─────────────────────────────────────────────────────────────────────────────
 * DrawDoc.jackpot.closingAmount = jackpotOpeningAmount + jackpotContribution.
 * FinalizeSettle tự tính từ 2 giá trị này — không cần field riêng.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import type { DrawSettleSummary } from "@megawin/game-mega645/entities";
import { MEGA645_PRIZE_TIER_VALUES, PrizeTier } from "@megawin/game-mega645/entities";
import { calculateDrawFinancials, type DrawFinancialInput } from "@megawin/game-mega645/rules";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext, SettleFinancials } from "./types";

/**
 * Tính toán tài chính tổng hợp kỳ quay Mega 6/45 sau khi tất cả entries đã settled.
 *
 * Ghi `financial`, `stats`, `settleSummary` vào DrawDoc trong 1 DB call duy nhất.
 * Xác định `hasJackpotWinner` để FinalizeSettle xử lý tiếp.
 *
 * CRASH-SAFE: aggregate từ DB nên idempotent — chạy lại nhiều lần cho kết quả giống nhau.
 */
export class CalculateFinancialsUseCase extends InternalUseCase<SettleContext, SettleFinancials> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId, config } = input;

    // ── Bước 1: Aggregate dữ liệu từ DB ──────────────────────────────────────
    // Chạy song song 2 queries để giảm latency.
    // aggregateTotalRevenue: 1 document kết quả (group by null) thay vì group by tenant.
    const [{ totalRevenue, totalAgentCommission }, payoutSummary] = await Promise.all([
      this.entryRepo.aggregateTotalRevenue(drawId),
      this.entryRepo.aggregateSettledPayoutSummary(drawId),
    ]);

    // ── Bước 2: Tính toán tài chính kỳ quay ──────────────────────────────────
    // calculateDrawFinancials tính: totalAgentCommission, companyTake,
    // actualCompanyTake, jackpotContribution theo công thức trong jackpot.ts.
    const financialInput: DrawFinancialInput = {
      totalRevenue,
      totalFixedPrizes: payoutSummary.totalFixedPrizes,
      totalAgentCommission,
      companyRate: config.companyRate,
    };

    const fin = calculateDrawFinancials(financialInput);

    // ── Bước 3: Xác định Jackpot winner ───────────────────────────────────────
    const jackpotWinnerCount = payoutSummary.tierWinnerCounts[PrizeTier.Jackpot] ?? 0;
    const hasJackpotWinner = jackpotWinnerCount > 0;

    // ── Bước 4: Build settleSummary (denormalized cho player API) ─────────────
    // Tất cả 4 tiers luôn có mặt (kể cả winnerCount = 0) để player API không cần
    // aggregate từ entries — 1 DB call duy nhất.
    // Jackpot prizeAmount = 0 tại đây; FinalizeSettle patch lại sau khi biết pool.
    const settleSummary: DrawSettleSummary = {
      tiers: MEGA645_PRIZE_TIER_VALUES.map((tier) => ({
        tier,
        winnerCount: payoutSummary.tierWinnerCounts[tier] ?? 0,
        // Jackpot: 0 tạm thời, FinalizeSettle sẽ patch = openingAmount + contribution.
        // Non-jackpot: tổng tiền thực tế aggregate từ entries.
        prizeAmount: tier === PrizeTier.Jackpot ? 0 : (payoutSummary.tierPrizeAmounts[tier] ?? 0),
      })),
    };

    // ── Bước 5: Ghi financial + stats + settleSummary vào DrawDoc ─────────────
    // updateSettleResult ghi cả 3 trong 1 lần $set — tối thiểu DB call.
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
        ticketEntryCount: payoutSummary.totalSettled,
        totalLineCount: payoutSummary.totalLines,
        totalSalesAmount: fin.totalRevenue,
        totalPayoutAmount: payoutSummary.totalPayoutAmount,
      },
      settleSummary,
    );

    // ── Bước 5: Return SettleFinancials cho Step Function merge ──────────────
    return {
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
      actualCompanyTake: fin.actualCompanyTake,
      jackpotContribution: fin.jackpotContribution,
      hasJackpotWinner,
    };
  }
}
