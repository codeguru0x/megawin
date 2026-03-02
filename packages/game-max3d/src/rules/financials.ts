/**
 * Max 3D – Financial Calculations
 *
 * Max 3D không có Jackpot tích lũy. Tất cả giải thưởng cố định.
 *
 * Công thức phân bổ doanh thu:
 *   Revenue = 100% doanh thu tiền cược
 *   ├── Agent Commission = Σ(commissionRate_i × revenue_i) per tenant
 *   ├── Company Take     = companyRate × Revenue
 *   └── Remaining        = Revenue - Commission - CompanyTake - FixedPrizes
 */

import type { FinancialRates } from "../entities/types";

export interface DrawFinancialInput {
  /** Tổng doanh thu = Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định = Σ(entry.payout.winAmount). */
  totalFixedPrizes: number;
  /** Doanh thu & hoa hồng theo từng đại lý. */
  tenantRevenues: Array<{
    /** ID đại lý. */
    tenantId: string;
    /** Doanh thu đại lý = Σ(entry.amount) của tenant. */
    revenue: number;
    /** Hoa hồng đại lý = revenue × commissionRate. */
    commission: number;
    /** Tỷ lệ hoa hồng của đại lý (snapshot từ tenant config). */
    commissionRate: number;
  }>;
  /** Tỷ lệ phần trăm công ty (từ global config). */
  companyRate: number;
}

export interface DrawFinancialResult {
  /** Tổng doanh thu = Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định = Σ(entry.payout.winAmount). */
  totalFixedPrizes: number;
  /** Hoa hồng đại lý = Σ(tenant.commission). */
  totalAgentCommission: number;
  /** Phần công ty (requested) = companyRate × totalRevenue. */
  companyTake: number;
  /**
   * Phần công ty thực tế = min(companyTake, remaining after prizes & commission).
   * remaining = totalRevenue − totalFixedPrizes − totalAgentCommission.
   * Nếu remaining < 0 thì actualCompanyTake = 0.
   */
  actualCompanyTake: number;
  /**
   * Lợi nhuận = remaining − actualCompanyTake.
   * remaining = totalRevenue − totalFixedPrizes − totalAgentCommission.
   * Luôn >= 0.
   */
  profit: number;
  /** Phân tích theo từng đại lý. */
  tenantBreakdown: Array<{
    /** ID đại lý. */
    tenantId: string;
    /** Doanh thu đại lý. */
    revenue: number;
    /** Hoa hồng đại lý. */
    commission: number;
    /** Tỷ lệ hoa hồng. */
    commissionRate: number;
  }>;
}

export function calculateDrawFinancials(
  input: DrawFinancialInput
): DrawFinancialResult {
  const { totalRevenue, totalFixedPrizes, tenantRevenues, companyRate } = input;

  const tenantBreakdown = tenantRevenues.map((t) => ({
    tenantId: t.tenantId,
    revenue: t.revenue,
    commission: t.commission,
    commissionRate: t.commissionRate,
  }));

  const totalAgentCommission = tenantBreakdown.reduce(
    (sum, t) => sum + t.commission,
    0
  );

  const companyTake = Math.round(totalRevenue * companyRate);

  const remainAfterPrizes =
    totalRevenue - totalFixedPrizes - totalAgentCommission;

  const actualCompanyTake = Math.min(
    companyTake,
    Math.max(remainAfterPrizes, 0)
  );

  const profit = Math.max(remainAfterPrizes - actualCompanyTake, 0);

  return {
    totalRevenue,
    totalFixedPrizes,
    totalAgentCommission,
    companyTake,
    actualCompanyTake,
    profit,
    tenantBreakdown,
  };
}
