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

/**
 * 1 board basic của account (ownership-gate minh bạch combo — p1-01).
 *
 * Projection cực nhẹ `{ playType, numbers }` từ `entrySummary.boards`. Chỉ board có
 * `numbers` (pick1-10) mới đưa vào — dùng để xác định combo player yêu cầu có thuộc họ.
 */
export interface OwnedBoard {
  /** Loại chơi basic — chỉ pick8/9/10 mới hợp lệ cho tra cứu minh bạch. */
  playType: string;
  /** Số "01".."80" của board. */
  numbers: string[];
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

/**
 * Candidate entry cần snapshot reversal khi PrepareResettle.
 *
 * Chỉ entries `Settled` có `payout.payoutAmount > 0` mới cần reversal —
 * vì chỉ những entries đó từng phát sinh payout dispatch ở phiên settle trước.
 * Entries thua (payoutAmount = 0) không cần reversal, chỉ cần reset về Scheduled.
 */
export interface ReversalCandidate {
  /** Entry _id (hex string). */
  id: string;
  /** payout.payoutAmount cũ — sẽ trở thành reversalAmount để debit ngược. */
  payoutAmount: number;
}

/**
 * Shape tối thiểu trả về cho `getEntriesWithReversalForDispatch` — dùng bởi
 * `EnqueueReversalsUseCase` để build reversal `TenantDispatchOrderDoc`.
 *
 * Chỉ chứa fields cần thiết cho reversal dispatch.
 */
export interface ReversalEntryForDispatch {
  /** Entry _id (hex string). */
  id: string;
  tenantId: string;
  accountId: string;
  username: string;
  ticketNo: string;
  /** Số tiền debit lại tenant (VND) = `reversal.reversalAmount`. */
  reversalAmount: number;
  /** Idempotency key cho reversal dispatch (UUIDv7). */
  reversalTx: string;
}
