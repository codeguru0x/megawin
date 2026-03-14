/** Keno: KHÔNG CÓ lineCount. */
export interface TenantAggregateSummary {
  tenantId: string;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  ggr: number;
  commission: number;
}
