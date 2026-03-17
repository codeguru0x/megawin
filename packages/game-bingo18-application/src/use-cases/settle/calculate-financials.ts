/**
 * Use Case: Calculate Financials (Bingo 18)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * Bingo 18 KHÔNG có Jackpot, KHÔNG có payout caps – chỉ tính:
 *   - totalRevenue, totalPrizes
 *   - totalAgentCommission (từ entry.tenant.commissionAmount snapshot)
 *   - companyTake = revenue - prizes - commission
 *
 * Đồng thời denormalize settleSummary lên draw cho player API.
 * Chỉ lưu các giải có winnerCount > 0 — compact document.
 *
 * IDEMPOTENT: aggregate từ DB → chạy lại cho kết quả giống nhau.
 * Ghi financial + stats + settleSummary trong 1 DB call duy nhất.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { calculateBingo18DrawFinancials } from "@megawin/game-bingo18/rules";
import type {
  DrawBasicPrizeSummary,
  DrawSideBetPrizeSummary,
  DrawSettleSummary,
  DrawFinancial,
  DrawStats,
} from "@megawin/game-bingo18/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext, SettleFinancials } from "./types";

/**
 * Tính tài chính tổng hợp Bingo 18 sau khi tất cả entries đã settled.
 *
 * CRASH-SAFE + IDEMPOTENT: aggregate từ DB → có thể chạy lại nhiều lần an toàn.
 * Ghi financial + stats + settleSummary vào DrawDoc trong 1 DB call duy nhất.
 */
export class CalculateFinancialsUseCase extends InternalUseCase<SettleContext, SettleFinancials> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /**
   * Tính tài chính tổng hợp Bingo 18 + denormalize settleSummary.
   * Idempotent — tính từ DB, ghi đè nếu chạy lại.
   */
  protected async execute(input: SettleContext): Promise<SettleFinancials> {
    const { drawId } = input;

    // Chạy song song 3 queries để giảm latency.
    // Query 1: gộp revenue + commission + payout trong 1 pipeline (tất cả entries đã Settled).
    // Query 2+3: prize summary tách riêng vì $unwind boardPayouts/sideBetPayouts khác nhau.
    const [summary, basicPrizeSummary, sideBetPrizeSummary] = await Promise.all([
      this.entryRepo.aggregateSettledFinancialSummary(drawId),
      this.entryRepo.aggregateBasicPrizeSummary(drawId),
      this.entryRepo.aggregateSideBetPrizeSummary(drawId),
    ]);

    const fin = calculateBingo18DrawFinancials({
      totalRevenue: summary.totalRevenue,
      totalPrizes: summary.totalPrizes,
      totalAgentCommission: summary.totalAgentCommission,
    });

    // ── Build settleSummary cho player API ─────────────────────────────────
    // Chỉ lưu các giải có winnerCount > 0 — tránh lưu tất cả combination possible.
    // basicPrizes: (playType, matchCount) → đủ để UI hiển thị bảng giải theo cách chơi.
    // sideBetPrizes: (playType, bet) → hiển thị cộng tổng + lớn/hòa/nhỏ.
    const basicPrizes: DrawBasicPrizeSummary[] = basicPrizeSummary.map((bp) => ({
      playType: bp.playType as DrawBasicPrizeSummary["playType"],
      matchCount: bp.matchCount,
      // tripleKind chỉ có ý nghĩa với tripleMatch; null từ aggregation → bỏ qua (undefined).
      ...(bp.tripleKind != null && {
        tripleKind: bp.tripleKind as DrawBasicPrizeSummary["tripleKind"],
      }),
      winnerCount: bp.winnerCount,
      prizePerUnit: bp.prizePerUnit,
    }));

    const sideBetPrizes: DrawSideBetPrizeSummary[] = sideBetPrizeSummary.map((sb) => ({
      playType: sb.playType as DrawSideBetPrizeSummary["playType"],
      // sum (number) cho sumTotal, bet (string) cho bigSmallDraw — không trộn lẫn.
      ...(sb.sum != null && { sum: sb.sum }),
      ...(sb.bet != null && { bet: sb.bet as DrawSideBetPrizeSummary["bet"] }),
      winnerCount: sb.winnerCount,
      prizePerUnit: sb.prizePerUnit,
    }));

    const settleSummary: DrawSettleSummary = { basicPrizes, sideBetPrizes };

    // Ghi financial + stats + settleSummary trong 1 DB call (idempotent overwrite).
    // 3 embedded docs này chỉ được set 1 lần duy nhất → full overwrite an toàn.
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
      settleSummary,
    );

    return {
      totalRevenue: fin.totalRevenue,
      totalPrizes: fin.totalPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
    } satisfies SettleFinancials;
  }
}
