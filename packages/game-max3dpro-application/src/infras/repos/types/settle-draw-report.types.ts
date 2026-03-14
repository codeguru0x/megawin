/**
 * Aggregate result types cho settle draw report queries — Max 3D Pro.
 *
 * Tách riêng khỏi class repo để tránh circular imports.
 * Max 3D Pro: CÓ lineCount (pairs), KHÔNG CÓ jackpotContribution.
 */

/**
 * Kết quả aggregate SUM tất cả draws trong 1 date range.
 *
 * Dùng bởi GetDrawSummaryUseCase để hiển thị KPI strip.
 */
export interface DrawSummaryResult {
  drawCount: number;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  /** Tổng số cặp (pairs) trong kỳ. */
  lineCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  totalCommission: number;
  netProfit: number;
}
