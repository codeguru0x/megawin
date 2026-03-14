/**
 * Aggregate summary — SUM tất cả draws trong date range.
 * Dùng cho KPI strip tab "Theo kỳ quay".
 * Power 6/55: CÓ lineCount, CÓ jackpotContribution (tổng JP1+JP2).
 */
export interface DrawSummaryResult {
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  lineCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  /** Tổng thắng (VND). */
  totalWin: number;
  /** Tổng trả thưởng sau thuế (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}
