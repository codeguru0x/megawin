/**
 * Kết quả aggregate từ per-game settle tenant reports theo financialDate, group by tenantId.
 * Dùng làm input cho upsertTenantDaily trong SystemSettleTenantDailyRepository.
 */
export interface SettleTenantDailyAggregateResult {
  /** ID đại lý. */
  tenantId: string;
  /** Tổng tiền cược của tenant (VND). */
  totalStake: number;
  /** Tổng tiền thắng của tenant (VND). */
  totalWin: number;
  /** Tổng tiền trả thưởng của tenant (VND). */
  totalPayout: number;
  /** GGR = totalStake - totalPayout. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
  /** Số entry của tenant trong ngày. */
  entryCount: number;
  /** Số player (unique accountId) của tenant trong ngày. */
  playerCount: number;
  /** Số kỳ quay tenant có entry trong ngày. */
  drawCount: number;
}

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
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng trả thưởng (VND). */
  totalPayout: number;
  /** Gross Gaming Revenue = totalStake - totalPayout (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). */
  netProfit: number;
}
