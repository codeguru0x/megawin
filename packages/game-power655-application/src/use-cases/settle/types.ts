/**
 * Power 6/55 Settle – Shared Types
 *
 * Các interface dùng chung giữa settle steps.
 * Output step trước = Input step sau → định nghĩa 1 lần, dùng chung.
 *
 * Power 6/55 có DUAL JACKPOT (JP1: 6/6, JP2: 5/6 + bonus).
 * Tất cả types đều có jp1/jp2 prefixed fields.
 */

/**
 * Kết quả quay Power 6/55 — output PrepareSettle, input SettleEntries.
 * 6 số chính + 1 số bonus (từ 49 số còn lại).
 */
export interface PowerDrawResult {
  winningMain: string[];
  bonusNumber: string;
}

/**
 * Config settle — output PrepareSettle, input SettleEntries + CalculateFinancials.
 * Chứa tất cả config cần thiết cho settle flow, bao gồm dual jackpot params.
 */
export interface PowerSettleConfig {
  jp1SeedAmount: number;
  jp2SeedAmount: number;
  jp1Ratio: number;
  jp2Ratio: number;
  jp1OverflowThreshold: number;
  splitThreshold: number;
  splitRatios: {
    tier1: number;
    tier2: number;
    tier3: number;
  };
  companyRate: number;
  defaultCommissionRate: number;
}

/**
 * Financials output — output CalculateFinancials, input BuildReport + FinalizeSettle.
 * Dual jackpot: JP1 + JP2 riêng biệt.
 */
export interface PowerSettleFinancials {
  totalRevenue: number;
  totalFixedPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
  actualCompanyTake: number;
  jackpot1Contribution: number;
  jackpot2Contribution: number;
  jp1Overflow: number;
  closingJp1: number;
  closingJp2: number;
  nextJp1Opening: number;
  nextJp2Opening: number;
  hasJackpot1Winner: boolean;
  hasJackpot2Winner: boolean;
  splitDetails?: PowerSplitDetails;
  tenantBreakdown: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
    entryCount: number;
  }>;
}

/**
 * Chi tiết chia giải theo tier — dùng trong CalculateFinancials, FinalizeSettle, ApplySplitBonuses.
 * Chỉ có khi isSplitCycle = true.
 */
export type PowerSplitDetails = Record<
  string,
  {
    initialAmount: number;
    redistributedAmount: number;
    totalAmount: number;
    winnerCount: number;
    bonusPerWinner: number;
  }
>;
