/**
 * Type cho outstanding report summary aggregate — Max 3D Pro.
 *
 * Tách ra khỏi outstanding-report-repo.ts để tránh circular imports
 * và giữ đúng convention mongodb-repository-architecture §2.
 * Max 3D Pro CÓ lineCount (pairs).
 */

/**
 * Summary aggregate outstanding cho toàn game — dùng cho SyncSystemOutstanding.
 *
 * Aggregate từ collection max3dpro_outstanding_draw_reports.
 */
export interface OutstandingGameSummary {
  activeDrawCount: number;
  totalEntryCount: number;
  totalPlayerCount: number;
  totalTenantCount: number;
  /** Tổng tiền cược chưa settle (VND). */
  totalOutstandingStake: number;
  /** Ước tính hoa hồng phải trả (VND). */
  totalEstimatedCommission: number;
}
