/**
 * Aggregate result types cho entry breakdown queries — Max 3D.
 *
 * Tách riêng khỏi class repo để tránh circular imports.
 */

/**
 * Kết quả aggregate breakdown theo player trong 1 draw × tenant.
 *
 * Dùng bởi ListPlayerBreakdownUseCase để hiển thị danh sách người chơi.
 */
export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  /** Tổng số lines của player trong draw × tenant. */
  lineCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
}

/**
 * Kết quả aggregate metrics outstanding cho 1 draw (Query A).
 *
 * Không dùng $addToSet — chỉ tính số học nên memory footprint nhỏ.
 * Max 3D có lineCount (1 cho straight, 3/6 cho combo).
 * Index: { drawId: 1, status: 1 }
 */
export interface OutstandingDrawMetrics {
  drawId: string;
  financialDate: string;
  entryCount: number;
  lineCount: number;
  /** Tổng tiền cược pending (VND). */
  totalStake: number;
  /** Ước tính hoa hồng pending (VND). */
  estimatedCommission: number;
}

/**
 * Kết quả đếm unique players và tenants cho 1 draw (Query B).
 *
 * Dùng double-$group pattern thay vì $addToSet để tránh tích lũy array trong RAM.
 * Index: { drawId: 1, status: 1 }
 */
export interface OutstandingDrawCounts {
  drawId: string;
  playerCount: number;
  tenantCount: number;
}

/**
 * Shape tối thiểu của 1 winning entry cần để build `TenantDispatchOrderDoc`.
 *
 * Chỉ projection các field thiết yếu từ `getWinningEntriesForDispatch` —
 * nhỏ gọn, không load toàn bộ entry document (boards, tiers, ...).
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
 * Shape tối thiểu của 1 voided entry cần để build `TenantDispatchOrderDoc`.
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
 * Candidate entry cần snapshot reversal khi PrepareResettle — Max 3D.
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
