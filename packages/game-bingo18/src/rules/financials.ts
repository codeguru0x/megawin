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
  /** Doanh thu phân theo từng đại lý, dùng để tính hoa hồng riêng từng tenant. */
  tenantRevenues: Array<{
    /** ID đại lý. */
    tenantId: string;
    /** Doanh thu riêng đại lý = Σ(entry.amount) của entries thuộc tenant này. */
    revenue: number;
    /** Tỷ lệ hoa hồng đại lý (0-1). Lấy từ tenant config. */
    commissionRate: number;
    /** Hoa hồng đại lý = revenue × commissionRate. Tính sẵn bởi caller. */
    commission: number;
  }>;
  /** Tỷ lệ phần công ty (0-1). Lấy từ global config rates.companyRate. */
  companyRate: number;
}

/**
 * Kết quả tính tài chính kỳ quay.
 * Lưu vào draw.financial sau khi settle hoàn tất.
 */
export interface DrawFinancialResult {
  /** Tổng doanh thu = Σ(entry.amount). Copy từ input. */
  totalRevenue: number;
  /** Tổng tiền thưởng = Σ(entry.payout.winAmount). Copy từ input. */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý = Σ(tenant.commission). */
  totalAgentCommission: number;
  /** Phần công ty = Math.round(totalRevenue × companyRate). */
  companyTake: number;
  /** Lợi nhuận = totalRevenue - totalPrizes - totalAgentCommission - companyTake. Có thể âm. */
  profit: number;
  /** Chi tiết tài chính từng đại lý. */
  tenantBreakdown: Array<{
    /** ID đại lý. */
    tenantId: string;
    /** Doanh thu riêng đại lý. */
    revenue: number;
    /** Hoa hồng đại lý = revenue × commissionRate. */
    commission: number;
    /** Tỷ lệ hoa hồng áp dụng. */
    commissionRate: number;
  }>;
}

export function calculateBingo18DrawFinancials(
  input: DrawFinancialInput,
): DrawFinancialResult {
  const { totalRevenue, totalPrizes, tenantRevenues, companyRate } = input;

  const tenantBreakdown = tenantRevenues.map((t) => ({
    tenantId: t.tenantId,
    revenue: t.revenue,
    commission: t.commission,
    commissionRate: t.commissionRate,
  }));

  const totalAgentCommission = tenantBreakdown.reduce(
    (sum, t) => sum + t.commission,
    0,
  );

  const companyTake = Math.round(totalRevenue * companyRate);

  const profit =
    totalRevenue - totalPrizes - totalAgentCommission - companyTake;

  return {
    totalRevenue,
    totalPrizes,
    totalAgentCommission,
    companyTake,
    profit,
    tenantBreakdown,
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
    companyRate: 0.15,
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
