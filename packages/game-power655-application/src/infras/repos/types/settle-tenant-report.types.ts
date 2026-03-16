/**
 * Aggregate result nhóm theo tenantId trong date range.
 * Dùng cho tab "Theo đại lý" cấp 1.
 * Power 6/55: CÓ lineCount.
 */
export interface TenantAggregateSummary {
  tenantId: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  lineCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}
