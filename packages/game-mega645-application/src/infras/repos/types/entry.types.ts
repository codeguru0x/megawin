/**
 * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3.
 * Mega 6/45: CÓ lineCount.
 */
export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  lineCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
}

/**
 * Kết quả aggregate metrics outstanding cho 1 draw (Query A).
 *
 * Không dùng $addToSet — chỉ tính số học nên memory footprint nhỏ.
 * Mega645 có lineCount (expanded lines từ bao).
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

// ─────────────────────────────────────────────
// Dispatch Outbox DTOs
// ─────────────────────────────────────────────

/**
 * Minimal projection của winning entry để enqueue vào `tenant_dispatch_orders`.
 *
 * Dùng bởi `EnqueueDispatchPayoutsUseCase` — chỉ cần fields để build
 * `TenantDispatchOrderDoc`, tránh load full entry (boards, tiers, etc.).
 */
export interface WinningEntryForDispatch {
  id: string;
  tenantId: string;
  accountId: string;
  username: string;
  ticketNo: string;
  payoutAmount: number;
  /** UUIDv7 sinh tại settle time — idempotency key để worker gửi tenant. */
  payoutTx: string;
}

/**
 * Minimal projection của voided entry để enqueue refund vào `tenant_dispatch_orders`.
 *
 * Dùng bởi `EnqueueDispatchRefundsUseCase`.
 */
export interface VoidedEntryForDispatch {
  id: string;
  tenantId: string;
  accountId: string;
  username: string;
  ticketNo: string;
  refundAmount: number;
  /** UUIDv7 sinh tại void time — idempotency key để worker gửi tenant. */
  refundTx: string;
}
