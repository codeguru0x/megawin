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

/**
 * Kết quả aggregate per-tenant cho 1 draw — bao gồm commissionRate snapshot.
 * Dùng bởi CalculateFinancials (pipeline cũ). Xem TenantSettleMetrics cho BuildSettleReport.
 */
export interface TenantReportRow {
  tenantId: string;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  entryCount: number;
  /** CommissionRate snapshot từ lúc place-bet (không phải TenantConfig hiện tại). */
  commissionRate: number;
  totalCommission: number;
}

/**
 * Kết quả aggregate player breakdown per draw — group by {tenantId, accountId}.
 * Dùng bởi CalculateFinancials (pipeline cũ).
 */
export interface PlayerReportRow {
  tenantId: string;
  accountId: string;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
  entryCount: number;
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
 * Tổng doanh thu và hoa hồng cho 1 draw (exclude voided entries).
 * Dùng bởi CalculateFinancials.
 */
export interface DrawRevenueResult {
  /** Tổng doanh thu bán vé (VND). Công thức: SUM(entry.amount). */
  totalRevenue: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: SUM(entry.tenant.commissionAmount). */
  totalAgentCommission: number;
}

/**
 * Tổng kết payout entries đã settle của 1 draw.
 * Dùng bởi CalculateFinancials.
 */
export interface SettledPayoutSummary {
  /** Số entry đã settle. */
  totalSettled: number;
  /** Tổng tiền trả thưởng (VND). Công thức: SUM(entry.payout.payoutAmount). */
  totalPayoutAmount: number;
  /** Tổng tiền thắng (VND). Công thức: SUM(entry.payout.winAmount). */
  totalPrizes: number;
}

/**
 * Tổng hợp tài chính entries đã settle cho 1 draw — gộp revenue + payout trong 1 query.
 *
 * Tại thời điểm CalculateFinancials, TẤT CẢ entries đã là Settled
 * (SettleEntries hoàn tất, chưa có Void) → 1 pipeline đủ lấy cả revenue lẫn payout.
 * Tiết kiệm 1 DB round-trip so với 2 queries riêng (DrawRevenueResult + SettledPayoutSummary).
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
  totalEntries: number;
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
 * Tổng kết giải thưởng board cơ bản trúng trong 1 kỳ quay.
 * Group by (playType, matchCount, tripleKind?). Dùng bởi CalculateFinancials.
 */
export interface BasicPrizeSummaryRow {
  playType: string;
  matchCount: number;
  /** null với singleNum + doubleMatch. "specific" | "any" với tripleMatch. */
  tripleKind: string | null;
  winnerCount: number;
  /** Tiền thưởng mỗi lần cược (VND). */
  prizePerUnit: number;
}

/**
 * Tổng kết giải thưởng side bet trúng trong 1 kỳ quay.
 * Group by (playType, sum?, bet?). Dùng bởi CalculateFinancials.
 */
export interface SideBetPrizeSummaryRow {
  playType: string;
  /** Giá trị tổng trúng — chỉ có với sumTotal. */
  sum: number | null;
  /** Loại cược trúng — chỉ có với bigSmallDraw. */
  bet: string | null;
  winnerCount: number;
  /** Tiền thưởng mỗi lần cược (VND). */
  prizePerUnit: number;
}
