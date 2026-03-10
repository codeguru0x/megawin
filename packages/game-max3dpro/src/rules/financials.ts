/**
 * Max 3D Pro – Financial Calculations
 *
 * Max 3D Pro không có Jackpot tích lũy. Tất cả giải thưởng cố định.
 * Công ty thu TOÀN BỘ phần còn lại sau giải thưởng và hoa hồng.
 *
 * Công thức:
 *   profit = totalRevenue - totalFixedPrizes - totalAgentCommission
 *   (profit có thể âm — công ty chịu lỗ)
 */

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
}

export interface DrawFinancialResult {
  /** Tổng doanh thu = Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định = Σ(entry.payout.winAmount). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý = Σ(tenant.commission). */
  totalAgentCommission: number;
  /** Lợi nhuận = revenue - prizes - commission. Có thể âm (công ty chịu lỗ). */
  profit: number;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Max 3D Pro.
 *
 * Max 3D Pro không có Jackpot. Công ty thu toàn bộ phần còn lại.
 * profit = totalRevenue - totalFixedPrizes - totalAgentCommission
 * profit có thể âm khi tổng giải thưởng + hoa hồng > doanh thu.
 */
export function calculateDrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const { totalRevenue, totalFixedPrizes, tenantRevenues } = input;

  const totalAgentCommission = tenantRevenues.reduce((sum, t) => sum + t.commission, 0);

  const profit = totalRevenue - totalFixedPrizes - totalAgentCommission;

  return {
    totalRevenue,
    totalFixedPrizes,
    totalAgentCommission,
    profit,
  };
}
