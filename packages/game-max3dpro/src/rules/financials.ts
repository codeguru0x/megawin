/**
 * Max 3D Pro – Financial Calculations
 *
 * Max 3D Pro không có Jackpot tích lũy. Tất cả giải thưởng cố định.
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
  /** Doanh thu và hoa hồng theo từng tenant. */
  tenantRevenues: Array<{
    /** ID đại lý. */
    tenantId: string;
    /** Doanh thu từ tenant = Σ(entry.amount) cho tenant. */
    revenue: number;
    /** Hoa hồng = revenue × commissionRate. */
    commission: number;
  }>;
  /** Tỷ lệ phần trăm phần công ty (từ config). */
  companyRate: number;
}

export interface DrawFinancialResult {
  /** Tổng doanh thu = Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định = Σ(entry.payout.winAmount). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý = Σ(tenant.commission). */
  totalAgentCommission: number;
  /** Phần công ty (requested) = companyRate × totalRevenue. */
  companyTake: number;
  /** Phần công ty thực tế = min(companyTake, revenue - prizes - commission). Bảo vệ khỏi lỗ. */
  actualCompanyTake: number;
  /** Lợi nhuận = revenue - prizes - commission - actualCompanyTake. Luôn >= 0. */
  profit: number;
  /** Chi tiết doanh thu và hoa hồng theo từng tenant. */
  tenantBreakdown: Array<{
    /** ID đại lý. */
    tenantId: string;
    /** Doanh thu từ tenant. */
    revenue: number;
    /** Hoa hồng. */
    commission: number;
  }>;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Max 3D Pro.
 *
 * Max 3D Pro không có Jackpot. Phần còn lại sau prizes + commission + companyTake → profit.
 * actualCompanyTake được cap để không vượt quá phần remaining (bảo vệ khỏi lỗ).
 *
 * @param input - Dữ liệu tổng hợp từ DB
 * @returns Kết quả tài chính gồm profit, actualCompanyTake và tenant breakdown
 */
export function calculateDrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const { totalRevenue, totalFixedPrizes, tenantRevenues, companyRate } = input;

  const tenantBreakdown = tenantRevenues.map((t) => ({
    tenantId: t.tenantId,
    revenue: t.revenue,
    commission: t.commission,
  }));

  const totalAgentCommission = tenantBreakdown.reduce((sum, t) => sum + t.commission, 0);

  const companyTake = Math.round(totalRevenue * companyRate);

  const remainAfterPrizes = totalRevenue - totalFixedPrizes - totalAgentCommission;

  const actualCompanyTake = Math.min(companyTake, Math.max(remainAfterPrizes, 0));

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
