/**
 * Bingo 18 Settle – Shared Types
 *
 * Các interface dùng chung giữa settle steps.
 * Output step trước = Input step sau → định nghĩa 1 lần, dùng chung.
 */

import type {
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
} from "@megawin/game-bingo18/entities";

/**
 * Kết quả quay Bingo 18 — output PrepareSettle, input SettleEntries.
 */
export interface BingoDrawResult {
  /** 3 số kết quả (1-6). */
  numbers: number[];
  /** Tổng 3 số = numbers[0] + numbers[1] + numbers[2]. */
  sum: number;
}

/**
 * Config settle — output PrepareSettle, input SettleEntries + CalculateFinancials.
 * Chứa tất cả config cần thiết cho settle flow.
 */
export interface BingoSettleConfig {
  companyRate: number;
  defaultCommissionRate: number;
  singleNumPrizes: SingleNumPrizes;
  doubleMatchPrizes: DoubleMatchPrizes;
  tripleMatchPrizes: TripleMatchPrizes;
  sumTotalPrizes: SumTotalPrizes;
  bigSmallDrawPrizes: BigSmallDrawPrizes;
}

/**
 * Financials output — output CalculateFinancials, input BuildReport.
 */
export interface BingoSettleFinancials {
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
