/**
 * Max 3D – Financial Calculations
 *
 * Max 3D không có Jackpot tích lũy. Tất cả giải thưởng cố định.
 * Công ty thu TOÀN BỘ phần còn lại sau giải thưởng và hoa hồng.
 *
 * Công thức:
 *   companyTake = totalRevenue - totalFixedPrizes - totalAgentCommission
 *   (companyTake có thể âm — công ty chịu lỗ)
 */

/**
 * Hard cap tuyệt đối số board mỗi vé Max 3D — chống payload lạm dụng.
 *
 * Đây KHÔNG phải giới hạn nghiệp vụ (giới hạn thật là `play.maxBoardsPerTicket`
 * trong game config, có thể nhỏ hơn). Dùng làm trần cứng ở 2 tầng:
 * - Zod schema place-bet: `boards[]` không quá {@link MAX3D_MAX_BOARDS}.
 * - Zod schema update game config: `maxBoardsPerTicket` không cấu hình vượt trần này.
 *
 * Đảm bảo `maxBoardsPerTicket` luôn ≤ số board tối đa mà API chấp nhận.
 */
export const MAX3D_MAX_BOARDS = 100;

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
  /** Hoa hồng đại lý = Σ(tenant.commission). */
  totalAgentCommission: number;
  /**
   * Phần công ty thu = totalRevenue - totalFixedPrizes - totalAgentCommission.
   * Có thể âm nếu giải thưởng vượt doanh thu (công ty chịu lỗ).
   */
  companyTake: number;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Max 3D.
 *
 * Max 3D không có Jackpot. Công ty thu toàn bộ phần còn lại sau
 * giải thưởng cố định và hoa hồng đại lý. Profit có thể âm.
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
