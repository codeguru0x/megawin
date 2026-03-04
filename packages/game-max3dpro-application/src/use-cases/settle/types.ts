/**
 * Max 3D Pro Settle – Shared Types
 *
 * Các interface dùng chung giữa settle steps.
 * Output step trước = Input step sau → định nghĩa 1 lần, dùng chung.
 */

import type { PrizeAmounts } from "@megawin/game-max3dpro/entities";

/**
 * Kết quả quay Max 3D Pro — output PrepareSettle, input SettleEntries.
 * 20 bộ ba số theo 4 giải.
 */
export interface Max3dProDrawResult {
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
 */
export interface Max3dProSettleConfig {
  /** Tỷ lệ công ty (% doanh thu). */
  companyRate: number;
  /** Tỷ lệ hoa hồng đại lý mặc định. */
  defaultCommissionRate: number;
}

/**
 * Prize config — output PrepareSettle, input SettleEntries.
 */
export interface Max3dProPrizeConfig {
  /** Giải thưởng chế độ Standard (8 giải: special → sixth). */
  standard: PrizeAmounts;
}

/**
 * Financials output — output CalculateFinancials, input BuildReport.
 */
export interface Max3dProSettleFinancials {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định đã trả (VND). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /** Phần công ty theo tỷ lệ = totalRevenue × companyRate (VND). */
  companyTake: number;
  /** Phần công ty thực tế = totalRevenue − totalFixedPrizes − totalAgentCommission (VND). */
  actualCompanyTake: number;
  /** Lợi nhuận = actualCompanyTake (VND). */
  profit: number;
  /** Chi tiết tài chính theo từng tenant. */
  tenantBreakdown: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Doanh thu từ tenant (VND). */
    revenue: number;
    /** Hoa hồng đại lý (VND). */
    commission: number;
    /** Tỷ lệ hoa hồng (0-1). */
    commissionRate: number;
    /** Số entries của tenant. */
    entryCount: number;
  }>;
}
