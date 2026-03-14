/**
 * Aggregate result types cho settle tenant report queries — Max 3D.
 *
 * Tách riêng khỏi class repo để tránh circular imports.
 */

/**
 * Kết quả aggregate SUM của 1 tenant trong date range.
 *
 * Dùng bởi ListTenantReportsUseCase tab "Theo Đại Lý".
 */
export interface TenantAggregateSummary {
  tenantId: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  /** Tổng số lines của tenant trong kỳ. */
  lineCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  commission: number;
}
