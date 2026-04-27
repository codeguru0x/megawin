import type { Bingo18BigSmallBet, Bingo18TripleKind } from "@megawin/game-bingo18/entities";

/**
 * Breakdown player trong 1 draw × 1 tenant. Drill cấp 3 financial reports.
 * Bingo 18: KHÔNG CÓ lineCount.
 */
export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
}

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
 * Tổng hợp tài chính entries đã settle cho 1 draw — gộp revenue + payout trong 1 query.
 *
 * Tại thời điểm CalculateFinancials, TẤT CẢ entries đã là Settled
 * (SettleEntries hoàn tất, chưa có Void) → 1 pipeline đủ lấy cả revenue lẫn payout.
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
 * Metrics tài chính per tenant cho 1 draw đã settle.
 * Dùng bởi BuildSettleReport để build SettleTenantReport[].
 * Bingo 18: KHÔNG CÓ lineCount.
 */
export interface TenantSettleMetrics {
  tenantId: string;
  entryCount: number;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}

/**
 * Số unique players per tenant cho 1 draw đã settle.
 * Dùng song song với TenantSettleMetrics trong BuildSettleReport.
 */
export interface TenantPlayerCount {
  tenantId: string;
  playerCount: number;
}

/**
 * Metrics tổng hợp từ entries đã void cho 1 draw.
 * Dùng bởi BuildVoidReport.
 */
export interface VoidMetrics {
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  /** Tổng tiền cược gốc (VND). */
  totalOriginalStake: number;
  /** Tổng tiền hoàn trả (VND). */
  totalRefundAmount: number;
}

/**
 * Tổng kết entries hoàn tiền cho 1 draw void.
 * Dùng bởi FinalizeVoid.
 */
export interface VoidRefundSummary {
  /** Số entry đã void. */
  totalVoidedEntries: number;
  /** Tổng tiền cược gốc (VND). */
  totalOriginalAmount: number;
  /** Tổng tiền đã hoàn trả (VND). */
  totalRefundAmount: number;
}

/**
 * Tóm tắt aggregate từ TẤT CẢ entries của 1 ticket.
 * Dùng cho SyncTicketSummaries — tính lại toàn bộ từ source of truth (entries).
 */
export interface TicketAggregateResult {
  /** Số kỳ đã settle. */
  settledCount: number;
  /** Số kỳ đã void. */
  voidedCount: number;
  /** Tổng tiền thắng của tất cả kỳ đã settle (VND). */
  totalWinAmount: number;
  /** Tổng tiền cược của các kỳ bị void (VND). */
  totalVoidedAmount: number;
  /** Tổng tiền đã hoàn trả (VND). */
  totalRefundedAmount: number;
  /** Danh sách drawId các kỳ bị void. */
  voidedDrawIds: string[];
}

/**
 * KPI tổng hợp cho Operations Dashboard.
 * Bingo 18: profit = revenue - prizes - commission (KHÔNG có Jackpot).
 */
export interface OpsSummary {
  /** Tổng doanh thu bán vé (VND). */
  totalRevenue: number;
  /** Tổng số entries. */
  totalEntries: number;
  /** Tổng số boards cơ bản (singleNum/doubleMatch/tripleMatch). */
  totalBoards: number;
  /** Tổng số side bets (sumTotal/bigSmallDraw). */
  totalSideBets: number;
  /** Số unique players. */
  uniquePlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}

/**
 * Summary entries trúng thưởng trong 1 draw.
 * Bingo 18: không có cappedEntries (không có payout cap).
 */
export interface WinningEntriesSummary {
  /** Số entries trúng thưởng. */
  totalWinningEntries: number;
  /** Tổng tiền thắng (VND). */
  totalWinAmount: number;
}

/**
 * Tổng kết giải thưởng (cả cơ bản và bổ sung) trúng trong 1 kỳ quay.
 * Group by (playType, matchCount, tripleKind?, sum?, bet?). Dùng bởi CalculateFinancials.
 *
 * Unified: cơ bản dùng matchCount + tripleKind, bổ sung dùng sum/bet.
 */
export interface PrizeSummaryRow {
  playType: string;
  /**
   * Số lần xuất hiện trong kết quả. Meaningful cho cơ bản.
   * Bổ sung (sumTotal/bigSmallDraw): null — field không áp dụng.
   */
  matchCount: number | null;
  /** null với singleNum + doubleMatch. "specific" | "any" với tripleMatch. */
  tripleKind: Bingo18TripleKind | null;
  /** Giá trị tổng trúng — chỉ có với sumTotal. null cho các loại khác. */
  sum: number | null;
  /** Loại cược trúng — chỉ có với bigSmallDraw. null cho các loại khác. */
  bet: Bingo18BigSmallBet | null;
  /** Số lượt cược trúng tổ hợp này trong kỳ quay. */
  winnerCount: number;
  /** Tiền thưởng mỗi lần cược (VND). */
  prizePerUnit: number;
}

/**
 * Shape tối thiểu trả về cho `getWinningEntriesForDispatch` — dùng bởi
 * `EnqueueDispatchPayoutsUseCase` để build `TenantDispatchOrderDoc`.
 *
 * Chỉ chứa fields cần thiết cho dispatch → giảm payload khi draw có hàng nghìn winners.
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
