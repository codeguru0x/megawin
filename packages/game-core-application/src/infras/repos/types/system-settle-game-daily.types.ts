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
