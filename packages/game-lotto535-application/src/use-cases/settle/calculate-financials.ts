/**
 * Use Case: Calculate Financials
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 *
 * CRASH-SAFE DESIGN:
 *   - KHÔNG dựa vào accumulator từ step function (có thể sai/mất khi crash)
 *   - Aggregate TẤT CẢ settled entries từ DB để tính:
 *     + totalFixedPrizes, tierWinnerCounts (từ payout.tiers)
 *     + revenue + commission per tenant (từ entries, dùng commission.amount đã tính sẵn)
 *   - Tính commission, companyTake, jackpotContribution từ rules
 *   - Ghi draw.financial (jackpot snapshot ghi ở finalize-settle)
 *
 * IDEMPOTENT: Chạy lại bao nhiêu lần cũng cho kết quả giống nhau
 * (vì tính từ settled entries trong DB, overwrite draw.financial).
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier } from "@megawin/game-lotto535/entities";
import {
  calculateDrawFinancials,
  calculateNextJackpot,
  calculateSplitDistribution,
  type DrawFinancialInput,
} from "@megawin/game-lotto535/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface CalculateFinancialsInput {
  /** Mã kỳ quay cần tính tài chính. */
  drawId: string;
  /** Số tiền Jackpot đầu kỳ (VND) — từ PrepareSettle. */
  jackpotOpeningAmount: number;
  /** Kỳ này có phải kỳ chia Jackpot hay không. */
  isSplitCycle: boolean;
  /** Tổng lines trong kỳ — dùng ghi stats. */
  totalLines: number;
  /** Cấu hình tài chính (snapshot từ GlobalConfig). */
  config: {
    /** Số tiền khởi điểm Jackpot (VND). */
    seedAmount: number;
    /** Ngưỡng kích hoạt chia Jackpot (VND). */
    splitThreshold: number;
    /** Tỷ lệ chia Jackpot theo tier khi split. */
    splitRatios: {
      /** Tỷ lệ chia cho giải Nhất. */
      tier1: number;
      /** Tỷ lệ chia cho giải Nhì. */
      tier2: number;
      /** Tỷ lệ chia cho giải Ba. */
      tier3: number;
      /** Tỷ lệ chia cho giải Tư. */
      tier4: number;
      /** Tỷ lệ chia cho giải Năm. */
      tier5: number;
    };
    /** Tỷ lệ công ty thu về trên doanh thu (0-1). */
    companyRate: number;
  };
}

export interface CalculateFinancialsResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Tổng doanh thu kỳ (VND) = Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định đã trả (VND) — không bao gồm Jackpot. */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND) = Σ(tenant.revenue × tenant.commissionRate). */
  totalAgentCommission: number;
  /**
   * Phần công ty thu về tối đa (VND).
   * Công thức: companyTake = totalRevenue × companyRate.
   */
  companyTake: number;
  /**
   * Phần công ty thực tế thu về (VND).
   * Có thể nhỏ hơn companyTake nếu tổng chi vượt doanh thu.
   * Công thức: actualCompanyTake = totalRevenue − totalFixedPrizes − totalAgentCommission − jackpotContribution.
   */
  actualCompanyTake: number;
  /**
   * Phần đóng góp vào quỹ Jackpot (VND).
   * Công thức: jackpotContribution = totalRevenue − totalFixedPrizes − totalAgentCommission − companyTake.
   * (hoặc = 0 nếu kết quả âm).
   */
  jackpotContribution: number;
  /**
   * Số tiền Jackpot cuối kỳ (VND).
   * - Không có winner/split: closingJackpot = openingAmount + jackpotContribution.
   * - Có winner hoặc split: closingJackpot = seedAmount (reset).
   */
  closingJackpot: number;
  /**
   * Số tiền Jackpot mở cho kỳ tiếp theo (VND).
   * Thường bằng closingJackpot, hoặc seedAmount nếu cycle mới.
   */
  nextJackpotOpening: number;
  /** Có người trúng Jackpot trong kỳ hay không. */
  hasJackpotWinner: boolean;
  /**
   * Chi tiết phân bổ split — chỉ có khi isSplitCycle = true.
   * Key: tier name, Value: thông tin phân bổ cho tier đó.
   */
  splitDetails?: Record<
    string,
    {
      /** Số tiền ban đầu phân cho tier (VND) = jackpotAmount × splitRatio[tier]. */
      initialAmount: number;
      /** Số tiền tái phân bổ từ tier không có winner (VND). */
      redistributedAmount: number;
      /** Tổng tiền tier nhận (VND) = initialAmount + redistributedAmount. */
      totalAmount: number;
      /** Số người trúng tier này. */
      winnerCount: number;
      /** Tiền thưởng mỗi người (VND) = totalAmount / winnerCount. */
      bonusPerWinner: number;
    }
  >;
  /** Phân tích doanh thu theo từng tenant. */
  tenantBreakdown: Array<{
    /** Mã tenant. */
    tenantId: string;
    /** Doanh thu tenant (VND). */
    revenue: number;
    /** Hoa hồng tenant (VND) = revenue × commissionRate. */
    commission: number;
    /** Tỷ lệ hoa hồng tenant (0-1). */
    commissionRate: number;
    /** Số entries của tenant trong kỳ. */
    entryCount: number;
  }>;
}

export class CalculateFinancialsUseCase extends StepFunctionUseCase<
  CalculateFinancialsInput,
  CalculateFinancialsResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  /** Tính tài chính tổng hợp từ DB. Idempotent. */
  protected async execute(
    input: CalculateFinancialsInput
  ): Promise<CalculateFinancialsResult> {
    const { drawId, config, jackpotOpeningAmount, isSplitCycle } = input;
    /**
     * CRASH-SAFE: Tính từ DB thay vì accumulator.
     * aggregateSettledPayoutSummary() query tất cả settled entries
     * → tính totalFixedPrizes + tierWinnerCounts chính xác.
     */
    const [tenantAgg, payoutSummary] = await Promise.all([
      this.entryRepo.aggregateRevenueByTenant(drawId),
      this.entryRepo.aggregateSettledPayoutSummary(drawId),
    ]);

    const financialInput: DrawFinancialInput = {
      totalRevenue: tenantAgg.reduce((sum, t) => sum + t.revenue, 0),
      totalFixedPrizes: payoutSummary.totalFixedPrizes,
      tenantRevenues: tenantAgg.map((t) => ({
        tenantId: t.tenantId,
        revenue: t.revenue,
        commission: t.commission,
        commissionRate: t.commissionRate,
      })),
      companyRate: config.companyRate,
    };

    const fin = calculateDrawFinancials(financialInput);

    const jackpotWinnerCount =
      payoutSummary.tierWinnerCounts[PrizeTier.Jackpot] ?? 0;
    const hasJackpotWinner = jackpotWinnerCount > 0;

    let splitDetails: CalculateFinancialsResult["splitDetails"];

    if (isSplitCycle) {
      const winnerCountPerTier = new Map<PrizeTier, number>();
      for (const [tierStr, count] of Object.entries(
        payoutSummary.tierWinnerCounts
      )) {
        if (tierStr === PrizeTier.Jackpot || tierStr === PrizeTier.Consolation)
          continue;
        if (count > 0) winnerCountPerTier.set(tierStr as PrizeTier, count);
      }

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

    /**
     * Jackpot cuối kỳ:
     * - Có winner hoặc split → reset về seed
     * - Không winner → opening + contribution (tích luỹ)
     */
    const closingJackpot =
      hasJackpotWinner || isSplitCycle
        ? config.seedAmount
        : jackpotOpeningAmount + fin.jackpotContribution;

    const nextJackpotOpening = calculateNextJackpot(
      jackpotOpeningAmount,
      fin.jackpotContribution,
      hasJackpotWinner,
      config.seedAmount
    );

    const tenantBreakdown = tenantAgg.map((t) => ({
      tenantId: t.tenantId,
      revenue: t.revenue,
      commission: t.commission,
      commissionRate: t.commissionRate,
      entryCount: t.entryCount,
    }));

    await this.drawRepo.updateFinancial(drawId, {
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.actualCompanyTake,
      companyTakeRate: config.companyRate,
      companyTakeMax: fin.companyTake,
      jackpotContribution: fin.jackpotContribution,
    });

    await this.drawRepo.updateStats(drawId, {
      ticketEntryCount: payoutSummary.totalSettled,
      totalLineCount: input.totalLines,
      totalSalesAmount: fin.totalRevenue,
      totalPayoutAmount: payoutSummary.totalPayoutAmount,
    });

    return {
      drawId,
      totalRevenue: fin.totalRevenue,
      totalFixedPrizes: fin.totalFixedPrizes,
      totalAgentCommission: fin.totalAgentCommission,
      companyTake: fin.companyTake,
      actualCompanyTake: fin.actualCompanyTake,
      jackpotContribution: fin.jackpotContribution,
      closingJackpot,
      nextJackpotOpening,
      hasJackpotWinner,
      splitDetails,
      tenantBreakdown,
    };
  }
}
