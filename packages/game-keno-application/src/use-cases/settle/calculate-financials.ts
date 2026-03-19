/**
 * Use Case: Calculate Financials (Keno)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * Keno KHÔNG có Jackpot – công ty thu toàn bộ phần dư sau trả thưởng và hoa hồng:
 *   companyTake = totalRevenue - totalPrizes - totalAgentCommission
 *
 * Đồng thời denormalize settleSummary lên draw cho player API.
 *
 * IDEMPOTENT: Chạy lại cho kết quả giống nhau (tính từ DB).
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { calculateKenoDrawFinancials } from "@megawin/game-keno/rules";
import type {
  DrawBasicPrizeSummary,
  DrawSideBetPrizeSummary,
  DrawFinancial,
  DrawStats,
} from "@megawin/game-keno/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext, SettleFinancials } from "./types";

/**
 * Tính tài chính tổng hợp Keno sau khi tất cả entries đã settled.
 *
 * CRASH-SAFE + IDEMPOTENT: aggregate từ DB → có thể chạy lại nhiều lần an toàn.
 * Ghi financial + stats + settleSummary vào DrawDoc trong 1 DB call duy nhất.
 */
export class CalculateFinancialsUseCase extends InternalUseCase<SettleContext, SettleFinancials> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /**
   * Tính tài chính tổng hợp Keno + denormalize settleSummary.
   * Idempotent — tính từ DB, ghi đè nếu chạy lại.
   */
  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId, config } = input;

    // Chạy song song 3 queries để giảm latency.
    // Query 1: gộp revenue + commission + payout trong 1 pipeline (tất cả entries đã Settled).
    // Query 2+3: prize summary tách riêng vì $unwind boardPayouts/sideBetPayouts khác nhau.
    const [summary, basicPrizeSummary, sideBetPrizeSummary] = await Promise.all([
      this.entryRepo.aggregateSettledFinancialSummary(drawId),
      this.entryRepo.aggregateBasicPrizeSummary(drawId),
      this.entryRepo.aggregateSideBetPrizeSummary(drawId),
    ]);

    const fin = calculateKenoDrawFinancials({
      totalRevenue: summary.totalRevenue,
      totalPrizes: summary.totalPrizes,
      totalAgentCommission: summary.totalAgentCommission,
    });

    // ── Build settleSummary cho player API ──
    const basicPrizes: DrawBasicPrizeSummary[] = basicPrizeSummary.map((bp) => ({
      pickCount: bp.pickCount,
      matchCount: bp.matchCount,
      winnerCount: bp.winnerCount,
      prizePerUnit: bp.prizePerUnit,
    }));

    const sideBetPrizes: DrawSideBetPrizeSummary[] = sideBetPrizeSummary.map((sb) => ({
      playType: sb.playType as DrawSideBetPrizeSummary["playType"],
      bet: sb.bet as DrawSideBetPrizeSummary["bet"],
      winnerCount: sb.winnerCount,
      prizePerUnit: sb.prizePerUnit,
    }));

    // Ghi financial + stats + settleSummary trong 1 DB call (idempotent overwrite)
    await this.drawRepo.updateSettleResult(
      drawId,
      {
        totalRevenue: fin.totalRevenue,
        totalPrizes: fin.totalPrizes,
        totalAgentCommission: fin.totalAgentCommission,
        companyTake: fin.companyTake,
      } satisfies DrawFinancial,
      {
        ticketEntryCount: summary.totalSettled,
        totalSalesAmount: fin.totalRevenue,
        totalPayoutAmount: summary.totalPayoutAmount,
      } satisfies DrawStats,
      { basicPrizes, sideBetPrizes },
    );

    return {
      totalRevenue: fin.totalRevenue,
      totalPrizes: fin.totalPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
    } satisfies SettleFinancials;
  }
}
