/**
 * Use Case: Calculate Financials (Mega 6/45)
 *
 * Tính toán tài chính tổng hợp sau khi TẤT CẢ entries đã settled.
 * CRASH-SAFE: Aggregate từ DB. IDEMPOTENT.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier } from "@megawin/game-mega645/entities";
import {
  calculateDrawFinancials,
  calculateNextJackpot,
  calculateSplitDistribution,
  type DrawFinancialInput,
} from "@megawin/game-mega645/rules";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface CalculateFinancialsInput {
  /** ID kỳ quay cần tính tài chính. */
  drawId: string;
  /** Giá trị jackpot đầu kỳ (VND). */
  jackpotOpeningAmount: number;
  /** Kỳ này có thực hiện split jackpot không. */
  isSplitCycle: boolean;
  /** Tổng số dòng (lines) trong kỳ — dùng cho báo cáo. */
  totalLines: number;
  /** Cấu hình tài chính & jackpot. */
  config: {
    /** Giá trị khởi tạo jackpot khi tạo cycle mới (VND). */
    seedAmount: number;
    /** Ngưỡng chia jackpot (VND). */
    splitThreshold: number;
    /** Tỷ lệ chia jackpot cho từng hạng khi split. */
    splitRatios: {
      /** Tỷ lệ chia cho tier1 / jackpot (0-1). */
      tier1: number;
      /** Tỷ lệ chia cho tier2 – 5/6 (0-1). */
      tier2: number;
      /** Tỷ lệ chia cho tier3 – 4/6 (0-1). */
      tier3: number;
    };
    /** Tỷ lệ phần trăm công ty hưởng từ doanh thu (0-1). */
    companyRate: number;
  };
}

export interface CalculateFinancialsResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Tổng doanh thu kỳ quay (VND) = Σ revenue tất cả tenant. */
  totalRevenue: number;
  /** Tổng giải thưởng cố định đã trả (VND) — tier2 + tier3 + tier4. */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND) = Σ(revenue × commissionRate) cho mỗi tenant. */
  totalAgentCommission: number;
  /**
   * Phần công ty hưởng tối đa theo tỷ lệ (VND).
   * Công thức: companyTake = totalRevenue × companyRate.
   */
  companyTake: number;
  /**
   * Phần công ty thực tế hưởng (VND).
   * Công thức: actualCompanyTake = totalRevenue − totalFixedPrizes − totalAgentCommission − jackpotContribution.
   * Có thể nhỏ hơn companyTake nếu giải thưởng lớn.
   */
  actualCompanyTake: number;
  /** Đóng góp vào quỹ jackpot trong kỳ (VND). */
  jackpotContribution: number;
  /** Giá trị jackpot cuối kỳ (VND). Nếu có winner/split → reset về seedAmount. */
  closingJackpot: number;
  /** Giá trị jackpot mở đầu cycle tiếp theo (VND). */
  nextJackpotOpening: number;
  /** Có người trúng jackpot (6/6) trong kỳ không. */
  hasJackpotWinner: boolean;
  /**
   * Chi tiết chia jackpot theo hạng (chỉ có khi isSplitCycle = true).
   * Key = tier (e.g. "tier2"), value = thông tin chia cho hạng đó.
   */
  splitDetails?: Record<
    string,
    {
      /** Số tiền ban đầu phân bổ cho hạng = jackpotAmount × splitRatio (VND). */
      initialAmount: number;
      /** Số tiền tái phân phối từ hạng không có người trúng (VND). */
      redistributedAmount: number;
      /** Tổng tiền hạng = initialAmount + redistributedAmount (VND). */
      totalAmount: number;
      /** Số người trúng hạng này. */
      winnerCount: number;
      /** Tiền thưởng mỗi người = totalAmount / winnerCount (VND). */
      bonusPerWinner: number;
    }
  >;
  /** Phân tích doanh thu theo từng tenant. */
  tenantBreakdown: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Doanh thu của tenant (VND). */
    revenue: number;
    /** Hoa hồng tenant (VND) = revenue × commissionRate. */
    commission: number;
    /** Tỷ lệ hoa hồng tenant (0-1). */
    commissionRate: number;
    /** Số entry của tenant trong kỳ. */
    entryCount: number;
  }>;
}

export class CalculateFinancialsUseCase extends InternalUseCase<
  CalculateFinancialsInput,
  CalculateFinancialsResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(
    input: CalculateFinancialsInput
  ): Promise<CalculateFinancialsResult> {
    const { drawId, config, jackpotOpeningAmount, isSplitCycle } = input;

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
        if (tierStr === PrizeTier.Jackpot) continue;
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
