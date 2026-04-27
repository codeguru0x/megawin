/**
 * Tổng hợp tài chính entries đã settle cho 1 draw — gộp revenue + payout trong 1 query.
 *
 * Tại thời điểm CalculateFinancials, TẤT CẢ entries đã là Settled
 * (SettleEntries hoàn tất, chưa có Void) → 1 pipeline với filter { status: Settled }
 * đủ lấy cả revenue, commission lẫn payout metrics.
 * Tiết kiệm 1 DB round-trip so với 2 queries riêng (aggregateTotalRevenue + aggregateSettledPayoutSummary).
 */
export interface SettledFinancialSummary {
  /** Số entry đã settle. */
  totalSettled: number;
  /** Tổng doanh thu bán vé (VND). Công thức: SUM(entry.amount). */
  totalRevenue: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: SUM(entry.tenant.commissionAmount). */
  totalAgentCommission: number;
  /** Tổng tiền thắng (VND). Công thức: SUM(entry.payout.winAmount). */
  totalPrizes: number;
  /** Tổng tiền trả thưởng (VND). Công thức: SUM(entry.payout.payoutAmount). */
  totalPayoutAmount: number;
}

/** Keno: KHÔNG CÓ lineCount. */
export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
}

/**
 * Kết quả aggregate metrics outstanding cho 1 draw (Query A).
 *
 * Không dùng $addToSet — chỉ tính số học nên memory footprint nhỏ.
 * Keno không có lineCount.
 */
export interface OutstandingDrawMetrics {
  drawId: string;
  financialDate: string;
  entryCount: number;
  /** Tổng tiền cược pending (VND). */
  totalStake: number;
  /** Ước tính hoa hồng pending (VND). */
  estimatedCommission: number;
}

/**
 * Kết quả đếm unique players và tenants cho 1 draw (Query B).
 *
 * Dùng double-$group pattern thay vì $addToSet để tránh tích lũy array trong RAM.
 */
export interface OutstandingDrawCounts {
  drawId: string;
  playerCount: number;
  tenantCount: number;
}

/**
 * Shape tối thiểu trả về cho `getWinningEntriesForDispatch` — dùng bởi
 * `EnqueueDispatchPayoutsUseCase` để build `TenantDispatchOrderDoc`.
 *
 * Chỉ chứa fields cần thiết cho dispatch → giảm payload khi Keno draw có hàng nghìn winners.
 */
export interface WinningEntryForDispatch {
  id: string;
  tenantId: string;
  accountId: string;
  username: string;
  ticketNo: string;
  payoutAmount: number;
  payoutTx: string;
}

/**
 * Shape tối thiểu trả về cho `getVoidedEntriesForDispatch` — dùng bởi
 * `EnqueueDispatchRefundsUseCase` để build `TenantDispatchOrderDoc`.
 */
export interface VoidedEntryForDispatch {
  id: string;
  tenantId: string;
  accountId: string;
  username: string;
  ticketNo: string;
  refundAmount: number;
  refundTx: string;
}
