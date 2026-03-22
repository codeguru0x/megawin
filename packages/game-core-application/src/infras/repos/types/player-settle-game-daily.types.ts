/**
 * Kết quả aggregate từ per-game ticket_entries theo financialDate, group by { tenantId, accountId }.
 * Dùng làm input cho bulkUpsertPlayerDaily trong PlayerSettleGameDailyRepository.
 *
 * Per-game entry repo chạy aggregation pipeline:
 *   $match { financialDate, status ∈ [settled, void] }
 *   → $group by { tenantId, accountId }
 *   → output: PlayerDailyAggregateResult[]
 */
export interface PlayerDailyAggregateResult {
  /** ID đại lý sở hữu player. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;

  /** Số kỳ quay player tham gia (unique drawIds, bao gồm settled + void). */
  drawCount: number;
  /** Tổng số entry (settled + void). */
  entryCount: number;
  /** Số entry đã settle. */
  settledCount: number;
  /** Số entry thắng (outcome = "win"). */
  winCount: number;
  /** Số entry thua (outcome = "loss"). */
  lossCount: number;
  /** Số entry bị huỷ (status = "void"). */
  voidCount: number;

  /** Tổng tiền cược (VND) — CHỈ entries settled. */
  totalStake: number;
  /** Tổng tiền thắng gross (VND) — CHỈ entries settled. */
  totalWin: number;
  /** Tổng tiền trả thực (VND) — CHỈ entries settled. */
  totalPayout: number;
  /** Tổng hoa hồng đại lý (VND) — CHỈ entries settled. */
  totalCommission: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// READ types — dùng cho Player Detail page (Backoffice)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tổng hợp tất cả game của 1 player trong date range.
 * Dùng cho tab "Tổng quan" — KPI strip + game breakdown table.
 */
export interface PlayerOverviewResult {
  /** Tổng số kỳ quay (unique drawId cross-game). */
  totalDrawCount: number;
  /** Tổng số entry (settled + void, cross-game). */
  totalEntryCount: number;
  /** Tổng số entry settled. */
  totalSettledCount: number;
  /** Tổng số entry thắng. */
  totalWinCount: number;
  /** Tổng số entry void. */
  totalVoidCount: number;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
  /** GGR tổng hợp = totalStake - totalPayout (VND). Có thể ÂM. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). Có thể ÂM. */
  netProfit: number;
  /** Breakdown theo từng game, sort by totalStake desc. */
  games: PlayerGameBreakdownRow[];
}

/**
 * Thống kê 1 game cụ thể của 1 player trong date range.
 * Dùng cho game breakdown table trong tab "Tổng quan" và "Tài chính".
 */
export interface PlayerGameBreakdownRow {
  /** Game product identifier (lotto535, keno, ...). */
  gameProduct: string;
  /** Số kỳ quay player tham gia game này. */
  drawCount: number;
  /** Tổng số entry trong game này. */
  entryCount: number;
  /** Số entry settled. */
  settledCount: number;
  /** Số entry thắng. */
  winCount: number;
  /** Số entry thua. */
  lossCount: number;
  /** Số entry void. */
  voidCount: number;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
  /** GGR = totalStake - totalPayout (VND). Có thể ÂM. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). Có thể ÂM. */
  netProfit: number;
}
