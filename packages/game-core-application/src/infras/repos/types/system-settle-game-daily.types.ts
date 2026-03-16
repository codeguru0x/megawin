/**
 * Kết quả aggregate từ per-game settle draw reports theo financialDate.
 * Dùng làm input cho upsertGameDaily trong SystemSettleGameDailyRepository.
 */
export interface SettleGameDailyAggregateResult {
  /** Số kỳ quay đã settle trong ngày. */
  drawCount: number;
  /** Tổng số entry đã settle. */
  entryCount: number;
  /** Số player (unique accountId) trong ngày. */
  playerCount: number;
  /** Số tenant tham gia trong ngày. */
  tenantCount: number;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}

/**
 * Aggregate result khi nhóm theo financialDate — SUM tất cả game cho mỗi ngày.
 * Dùng cho tab "Tổng quan ngày" trong System Financial Reports.
 */
export interface DailyOverviewRow {
  financialDate: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  /** Tổng trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}

/**
 * Aggregate result khi nhóm theo gameProduct — SUM tất cả ngày cho mỗi game.
 * Dùng cho tab "Theo game".
 */
export interface GameSummaryRow {
  gameProduct: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  /** Tổng trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}

/**
 * Raw per-game data cho 1 ngày tài chính cụ thể.
 *
 * Dùng cho dashboard — client tự compute KPI totals, trend %, payout ratio.
 * 1 record = 1 game × 1 financialDate.
 * Trả về từ findByFinancialDates() trong SystemSettleGameDailyRepository.
 */
export interface DashboardGameDailyData {
  /** Game product identifier. */
  gameProduct: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Số kỳ quay đã settle. */
  drawCount: number;
  /** Tổng số entry đã settle. */
  entryCount: number;
  /** Số player (unique accountId) trong ngày. */
  playerCount: number;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). Có thể ÂM. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). Có thể ÂM. */
  netProfit: number;
}
