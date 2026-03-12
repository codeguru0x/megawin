/**
 * Bingo 18 – Financial Calculations
 *
 * Bingo 18 không có Jackpot tích luỹ và không có payout caps.
 * Giải thưởng cố định theo bảng, giải cao nhất = 1.200.000đ.
 */

import type { GlobalConfigDoc } from "../entities/global-config";
import {
  DEFAULT_SINGLE_NUM_PRIZES,
  DEFAULT_DOUBLE_MATCH_PRIZES,
  DEFAULT_TRIPLE_MATCH_PRIZES,
  DEFAULT_SUM_TOTAL_PRIZES,
  DEFAULT_BIG_SMALL_DRAW_PRIZES,
} from "./prize-tables";

// ─────────────────────────────────────────────
// Draw Financial Calculation
// ─────────────────────────────────────────────

/**
 * Input cho hàm tính tài chính kỳ quay.
 * Được tổng hợp từ tất cả entries trong kỳ trước khi gọi `calculateBingo18DrawFinancials()`.
 */
export interface DrawFinancialInput {
  /** Tổng doanh thu = Σ(entry.amount) cho tất cả entries trong kỳ. */
  totalRevenue: number;
  /** Tổng tiền thưởng = Σ(entry.payout.winAmount) cho tất cả entries thắng. */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: Σ(tenantAgg[].commission). */
  totalAgentCommission: number;
}

/**
 * Kết quả tính tài chính kỳ quay.
 *
 * Output của `calculateBingo18DrawFinancials()`.
 * Map trực tiếp lên `DrawFinancial` entity để ghi vào draw document.
 *
 * Bingo 18 KHÔNG có Jackpot → `companyTake` = toàn bộ profit còn lại
 * (revenue - prizes - commission). Có thể âm nếu trả thưởng lớn.
 */
export interface DrawFinancialResult {
  /** Tổng doanh thu = Σ(entry.amount). Copy từ input. */
  totalRevenue: number;
  /** Tổng tiền thưởng = Σ(entry.payout.winAmount). Copy từ input. */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý = Σ(tenant.commissionAmount). */
  totalAgentCommission: number;
  /**
   * Phần công ty thu (VND) = totalRevenue - totalPrizes - totalAgentCommission.
   * Bingo 18 không có Jackpot pool → companyTake = toàn bộ profit, có thể âm.
   * Map lên `DrawFinancial.companyTake` khi ghi vào DB.
   */
  companyTake: number;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Bingo 18.
 *
 * Bingo 18 KHÔNG có Jackpot, KHÔNG có payout caps.
 * Công thức: companyTake = totalRevenue - totalPrizes - totalAgentCommission (có thể âm).
 *
 * @param input - Dữ liệu tổng hợp từ DB sau khi tất cả entries đã settled.
 * @returns Kết quả tài chính map trực tiếp lên DrawFinancial entity.
 */
export function calculateBingo18DrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const { totalRevenue, totalPrizes, totalAgentCommission } = input;

  // companyTake = phần còn lại sau khi trừ giải thưởng + hoa hồng.
  // Không có Jackpot pool → công ty thu toàn bộ phần này. Có thể âm khi giải lớn.
  const companyTake = totalRevenue - totalPrizes - totalAgentCommission;

  return {
    totalRevenue,
    totalPrizes,
    totalAgentCommission,
    companyTake,
  };
}

// ─────────────────────────────────────────────
// Default Config Values
// ─────────────────────────────────────────────

export const DEFAULT_BINGO18_CONFIG: Pick<
  GlobalConfigDoc,
  | "rates"
  | "singleNumPrizes"
  | "doubleMatchPrizes"
  | "tripleMatchPrizes"
  | "sumTotalPrizes"
  | "bigSmallDrawPrizes"
  | "play"
> = {
  rates: {
    defaultCommissionRate: 0.2,
  },
  singleNumPrizes: { ...DEFAULT_SINGLE_NUM_PRIZES },
  doubleMatchPrizes: { ...DEFAULT_DOUBLE_MATCH_PRIZES },
  tripleMatchPrizes: { ...DEFAULT_TRIPLE_MATCH_PRIZES },
  sumTotalPrizes: { ...DEFAULT_SUM_TOTAL_PRIZES },
  bigSmallDrawPrizes: { ...DEFAULT_BIG_SMALL_DRAW_PRIZES },
  play: {
    unitPrice: 10_000,
    maxBasicBoardsPerTicket: 6,
    maxDrawCount: 20,
    salesCloseBeforeSeconds: 30,
    drawIntervalMinutes: 6,
    firstDrawTime: "06:00",
    lastDrawTime: "21:53",
    timezone: "Asia/Ho_Chi_Minh",
  },
};
