/**
 * Aggregate summary — SUM tất cả draws trong date range.
 * Mega 6/45: CÓ lineCount, CÓ jackpotContribution.
 */
export interface DrawSummaryResult {
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  lineCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  netProfit: number;
}
