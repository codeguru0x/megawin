/**
 * Aggregate result types cho entry breakdown queries — Max 3D Pro.
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
  /** Tổng số cặp (pairs) của player trong draw × tenant. */
  lineCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
}

/**
 * Kết quả aggregate metrics outstanding cho 1 draw (Query A).
 *
 * Không dùng $addToSet — chỉ tính số học nên memory footprint nhỏ.
 * Max 3D Pro có lineCount (pairs per board, từ multiNumber/multiDigit expansion).
 * betUnitCount = Σ(lineCount × betCount) — phản ánh đơn vị cược thực tế.
 * Index: { drawId: 1, status: 1 }
 */
export interface OutstandingDrawMetrics {
  drawId: string;
  financialDate: string;
  entryCount: number;
  /** Tổng pairs (không tính betCount). Dùng cho thống kê số học. */
  lineCount: number;
  /**
   * Tổng đơn vị cược = Σ(betUnitCount) = Σ(lineCount × betCount).
   * Fallback sang lineCount cho entries cũ.
   */
  betUnitCount: number;
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
