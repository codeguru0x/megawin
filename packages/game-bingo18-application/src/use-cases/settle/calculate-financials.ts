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
 * prizes[] chứa cả cơ bản và bổ sung (unified), phân biệt qua playType.
 * Chỉ lưu các giải có winnerCount > 0 — compact document.
 *
 * IDEMPOTENT: aggregate từ DB → chạy lại cho kết quả giống nhau.
 * Ghi financial + stats + settleSummary trong 1 DB call duy nhất.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { calculateBingo18DrawFinancials } from "@megawin/game-bingo18/rules";
import type {
  DrawPrizeSummary,
  DrawSettleSummary,
  DrawFinancial,
  DrawStats,
  Bingo18TripleKind,
  Bingo18PlayType,
  Bingo18BigSmallBet,
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

    // Chạy song song 2 queries để giảm latency.
    // Query 1: gộp revenue + commission + payout trong 1 pipeline (tất cả entries đã Settled).
    // Query 2: unified prize summary — boardPayouts chứa cả cơ bản và bổ sung.
    const [summary, prizeSummary] = await Promise.all([
      this.entryRepo.aggregateSettledFinancialSummary(drawId),
      this.entryRepo.aggregatePrizeSummary(drawId),
    ]);

    const fin = calculateBingo18DrawFinancials({
      totalRevenue: summary.totalRevenue,
      totalPrizes: summary.totalPrizes,
      totalAgentCommission: summary.totalAgentCommission,
    });

    // ── Build settleSummary cho player API ─────────────────────────────────
    // prizes[] chứa cả cơ bản và bổ sung, phân biệt qua playType.
    // Chỉ lưu các combination có winnerCount > 0 → compact document.
    // Group key: (playType, matchCount?, tripleKind?, sum?, bet?).
    const prizes: DrawPrizeSummary[] = prizeSummary.map((p) => ({
      playType: p.playType as Bingo18PlayType,
      matchCount: p.matchCount,
      // tripleKind chỉ có ý nghĩa với tripleMatch; null từ aggregation → bỏ qua (undefined).
      ...(p.tripleKind != null && {
        tripleKind: p.tripleKind as Bingo18TripleKind,
      }),
      // sum (number) cho sumTotal — null từ aggregation → bỏ qua.
      ...(p.sum != null && { sum: p.sum }),
      // bet (string) cho bigSmallDraw — null từ aggregation → bỏ qua.
      ...(p.bet != null && { bet: p.bet as Bingo18BigSmallBet }),
      winnerCount: p.winnerCount,
      prizePerUnit: p.prizePerUnit,
    }));

    const settleSummary: DrawSettleSummary = { prizes };

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
