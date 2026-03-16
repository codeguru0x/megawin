/** Bingo 18: KHÔNG CÓ lineCount. */
export interface TenantAggregateSummary {
  tenantId: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}
