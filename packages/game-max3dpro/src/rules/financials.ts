/**
 * Max 3D Pro – Financial Calculations
 *
 * Max 3D Pro không có Jackpot tích lũy. Tất cả giải thưởng cố định.
 * Công ty thu TOÀN BỘ phần còn lại sau giải thưởng và hoa hồng.
 *
 * Công thức:
 *   companyTake = totalRevenue - totalFixedPrizes - totalAgentCommission
 *   (companyTake có thể âm — công ty chịu lỗ)
 */

export interface DrawFinancialInput {
  /** Tổng doanh thu = Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định = Σ(entry.payout.winAmount). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: Σ(tenantAgg[].commission). */
  totalAgentCommission: number;
}

export interface DrawFinancialResult {
  /** Tổng doanh thu = Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định = Σ(entry.payout.winAmount). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý = Σ(tenant.commission). */
  totalAgentCommission: number;
  /** Phần công ty thu = revenue - prizes - commission. Có thể âm (công ty chịu lỗ). */
  companyTake: number;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Max 3D Pro.
 *
 * Max 3D Pro không có Jackpot. Công ty thu toàn bộ phần còn lại.
 * companyTake = totalRevenue - totalFixedPrizes - totalAgentCommission
 * companyTake có thể âm khi tổng giải thưởng + hoa hồng > doanh thu.
 */
export function calculateDrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const { totalRevenue, totalFixedPrizes, totalAgentCommission } = input;

  const companyTake = totalRevenue - totalFixedPrizes - totalAgentCommission;

  return {
    totalRevenue,
    totalFixedPrizes,
    totalAgentCommission,
    companyTake,
  };
}
