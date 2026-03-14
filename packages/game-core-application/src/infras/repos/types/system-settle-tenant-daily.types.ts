/**
 * Aggregate result khi nhóm theo tenantId — SUM cross-game cho mỗi tenant.
 * Dùng cho tab "Theo đại lý".
 */
export interface TenantSummaryRow {
  tenantId: string;
  gameCount: number;
  drawCount: number;
  entryCount: number;
  playerCount: number;
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  /** Tổng trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Hoa hồng đại lý (VND). */
  commission: number;
  /** Lợi nhuận ròng = ggr - commission (VND). */
  netProfit: number;
}
