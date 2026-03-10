/**
 * Use Case: Calculate Financials (Bingo 18)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * Bingo 18 KHÔNG có Jackpot, KHÔNG có payout caps – chỉ tính:
 *   - totalRevenue, totalPrizes
 *   - commission per tenant
 *   - profit
 *
 * Đồng thời denormalize settleSummary lên draw cho player API.
 * Chỉ lưu các giải có winnerCount > 0 — compact document.
 *
 * IDEMPOTENT: Chạy lại cho kết quả giống nhau (tính từ DB).
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { roundTo } from "@megawin/shared/utils/number";
import { calculateBingo18DrawFinancials } from "@megawin/game-bingo18/rules";
import type {
  DrawBasicPrizeSummary,
  DrawSideBetPrizeSummary,
  DrawSettleSummary,
} from "@megawin/game-bingo18/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext, SettleFinancials } from "./types";

export class CalculateFinancialsUseCase extends InternalUseCase<SettleContext, SettleFinancials> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /**
   * Tính tài chính tổng hợp Bingo 18 + denormalize settleSummary.
   * Idempotent — tính từ DB, ghi đè nếu chạy lại.
   */
  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId, config } = input;

    // Chạy song song 4 queries để giảm latency.
    const [tenantAgg, payoutSummary, basicPrizeSummary, sideBetPrizeSummary] = await Promise.all([
      this.entryRepo.aggregateRevenueByTenant(drawId),
      this.entryRepo.aggregateSettledPayoutSummary(drawId),
      this.entryRepo.aggregateBasicPrizeSummary(drawId),
      this.entryRepo.aggregateSideBetPrizeSummary(drawId),
    ]);

    const fin = calculateBingo18DrawFinancials({
      totalRevenue: tenantAgg.reduce((sum, t) => sum + t.revenue, 0),
      totalPrizes: payoutSummary.totalPrizes,
      tenantRevenues: tenantAgg.map((t) => ({
        tenantId: t.tenantId,
        revenue: t.revenue,
        commission: t.commission,
      })),
    });

    // ── Build settleSummary cho player API ─────────────────────────────────
    // Chỉ lưu các giải có winnerCount > 0 — tránh lưu tất cả combination possible.
    // basicPrizes: (playType, matchCount) → đủ để UI hiển thị bảng giải theo cách chơi.
    // sideBetPrizes: (playType, bet) → hiển thị cộng tổng + lớn/hòa/nhỏ.
    const basicPrizes: DrawBasicPrizeSummary[] = basicPrizeSummary.map((bp) => ({
      playType: bp.playType as DrawBasicPrizeSummary["playType"],
      matchCount: bp.matchCount,
      winnerCount: bp.winnerCount,
      prizePerUnit: bp.prizePerUnit,
    }));

    const sideBetPrizes: DrawSideBetPrizeSummary[] = sideBetPrizeSummary.map((sb) => ({
      playType: sb.playType as DrawSideBetPrizeSummary["playType"],
      bet: sb.bet,
      winnerCount: sb.winnerCount,
      prizePerUnit: sb.prizePerUnit,
    }));

    const settleSummary: DrawSettleSummary = { basicPrizes, sideBetPrizes };

    const tenantBreakdown = tenantAgg.map((t) => ({
      tenantId: t.tenantId,
      revenue: t.revenue,
      commission: t.commission,
      commissionRate: t.revenue > 0 ? roundTo(t.commission / t.revenue, 2) : 0,
      entryCount: t.entryCount,
    }));

    // Ghi financial + stats + settleSummary trong 1 DB call (idempotent overwrite)
    await this.drawRepo.updateSettleResult(
      drawId,
      {
        totalRevenue: fin.totalRevenue,
        totalPrizes: fin.totalPrizes,
        totalAgentCommission: fin.totalAgentCommission,
        companyTake: fin.profit,
      },
      {
        ticketEntryCount: payoutSummary.totalSettled,
        totalSalesAmount: fin.totalRevenue,
        totalPayoutAmount: payoutSummary.totalPayoutAmount,
      },
      settleSummary,
    );

    return {
      totalRevenue: fin.totalRevenue,
      totalPrizes: fin.totalPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      profit: fin.profit,
    };
  }
}
