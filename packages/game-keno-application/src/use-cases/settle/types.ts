/**
 * Keno Settle – Shared Types
 *
 * Các interface dùng chung giữa settle steps.
 * Output step trước = Input step sau → định nghĩa 1 lần, dùng chung.
 */

import type { BigSmallPrizes, EvenOddPrizes, PayoutCaps } from "@megawin/game-keno/entities";

/**
 * Kết quả quay Keno — output PrepareSettle, input SettleEntries.
 * Mapping 1:1 với DrawResultForMatch của helpers layer.
 */
export interface KenoDrawResult {
  winningNumbers: number[];
  bigCount: number;
  smallCount: number;
  evenCount: number;
  oddCount: number;
}

/**
 * Config settle — output PrepareSettle, input SettleEntries + CalculateFinancials.
 * Chứa tất cả config cần thiết cho settle flow.
 */
export interface KenoSettleConfig {
  companyRate: number;
  basicPrizes: Record<string, Record<number, number>>;
  bigSmallPrizes: BigSmallPrizes;
  evenOddPrizes: EvenOddPrizes;
  payoutCaps: PayoutCaps;
}

/**
 * Financials output — output CalculateFinancials, input BuildReport.
 */
export interface KenoSettleFinancials {
  totalRevenue: number;
  totalPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
  tenantBreakdown: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
    entryCount: number;
  }>;
}
