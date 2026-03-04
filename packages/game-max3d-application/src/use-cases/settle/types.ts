/**
 * Max 3D Settle – Shared Types
 *
 * Các interface dùng chung giữa settle steps.
 * Output step trước = Input step sau → định nghĩa 1 lần, dùng chung.
 */

/**
 * Kết quả quay Max 3D — output PrepareSettle, input SettleEntries.
 * 20 bộ ba số theo 4 giải.
 */
export interface Max3dDrawResult {
  /** Giải Đặc biệt: 2 bộ ba số. */
  special: [string, string];
  /** Giải Nhất: 4 bộ ba số. */
  first: [string, string, string, string];
  /** Giải Nhì: 6 bộ ba số. */
  second: [string, string, string, string, string, string];
  /** Giải Ba: 8 bộ ba số. */
  third: [string, string, string, string, string, string, string, string];
}

/**
 * Config settle — output PrepareSettle, input SettleEntries + CalculateFinancials.
 * Chứa tất cả config cần thiết cho settle flow.
 */
export interface Max3dSettleConfig {
  companyRate: number;
  defaultCommissionRate: number;
}

/**
 * Financials output — output CalculateFinancials, input BuildReport.
 */
export interface Max3dSettleFinancials {
  totalRevenue: number;
  totalFixedPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
  actualCompanyTake: number;
  profit: number;
  tenantBreakdown: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
    entryCount: number;
  }>;
}
