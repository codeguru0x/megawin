/**
 * Kết quả aggregate từ per-game outstanding draw reports.
 * Dùng làm input cho upsertGameOutstanding trong SystemOutstandingReportRepository.
 */
export interface OutstandingPerGameAggregateResult {
  /** Số draw đang active (chưa settle/void). */
  activeDrawCount: number;
  /** Tổng số entry pending. */
  totalEntryCount: number;
  /** Tổng số player (unique accountId) pending. */
  totalPlayerCount: number;
  /** Tổng số tenant tham gia pending. */
  totalTenantCount: number;
  /** Tổng tiền cược pending (VND). */
  totalOutstandingStake: number;
  /** Ước tính tổng hoa hồng pending (VND). */
  totalEstimatedCommission: number;
}
