/**
 * Aggregate summary — SUM tất cả draws trong date range.
 * Keno: KHÔNG CÓ lineCount, KHÔNG CÓ jackpotContribution.
 */
export interface DrawSummaryResult {
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  netProfit: number;
}
