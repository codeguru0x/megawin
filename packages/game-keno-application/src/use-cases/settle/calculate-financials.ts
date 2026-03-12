/**
 * Use Case: Calculate Financials (Keno)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * Keno KHÔNG có Jackpot – công ty thu toàn bộ phần dư sau trả thưởng và hoa hồng:
 *   profit = totalRevenue - totalPrizes - totalAgentCommission
 *
 * Đồng thời denormalize settleSummary lên draw cho player API.
 *
 * IDEMPOTENT: Chạy lại cho kết quả giống nhau (tính từ DB).
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { roundTo } from "@megawin/shared/utils/number";
import { calculateKenoDrawFinancials } from "@megawin/game-keno/rules";
import type { DrawBasicPrizeSummary, DrawSideBetPrizeSummary } from "@megawin/game-keno/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext, SettleFinancials } from "./types";

export class CalculateFinancialsUseCase extends InternalUseCase<SettleContext, SettleFinancials> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /** Tính tài chính tổng hợp Keno + denormalize settleSummary. Idempotent – tính từ DB. */
  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId, config } = input;

    const [{ totalRevenue, totalAgentCommission }, payoutSummary, basicPrizeSummary, sideBetPrizeSummary] = await Promise.all([
      this.entryRepo.aggregateTotalRevenue(drawId),
      this.entryRepo.aggregateSettledPayoutSummary(drawId),
      this.entryRepo.aggregateBasicPrizeSummary(drawId),
      this.entryRepo.aggregateSideBetPrizeSummary(drawId),
    ]);

    const fin = calculateKenoDrawFinancials({
      totalRevenue,
      totalPrizes: payoutSummary.totalPrizes,
      totalAgentCommission,
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
        companyTake: fin.profit,
      },
      {
        ticketEntryCount: payoutSummary.totalSettled,
        totalSalesAmount: fin.totalRevenue,
        totalPayoutAmount: payoutSummary.totalPayoutAmount,
      },
      { basicPrizes, sideBetPrizes },
    );

    return {
      totalRevenue: fin.totalRevenue,
      totalPrizes: fin.totalPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      profit: fin.profit,
    };
  }
}
