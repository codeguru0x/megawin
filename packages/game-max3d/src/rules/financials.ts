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
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Max 3D.
 *
 * Max 3D không có Jackpot. Phần còn lại sau prizes + commission + companyTake → profit.
 * actualCompanyTake được cap để không vượt quá phần remaining (bảo vệ khỏi lỗ).
 *
 * @param input - Dữ liệu tổng hợp từ DB
 * @returns Kết quả tài chính gồm profit, actualCompanyTake và tenant breakdown
 */
export function calculateDrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const { totalRevenue, totalFixedPrizes, tenantRevenues, companyRate } = input;

  const totalAgentCommission = tenantRevenues.reduce((sum, t) => sum + t.commission, 0);

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
  };
}
