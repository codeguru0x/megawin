/**
 * Kết quả aggregate metrics outstanding cho 1 draw (Query A).
 *
 * Không dùng $addToSet — chỉ tính số học nên memory footprint nhỏ.
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

export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  lineCount: number;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
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
