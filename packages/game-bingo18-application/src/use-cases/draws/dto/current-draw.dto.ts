// ─────────────────────────────────────────────
// GetCurrentDraw / GetActiveDraws
// ─────────────────────────────────────────────

export interface CurrentDrawInfo {
  /** ID kỳ quay hiện tại. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Trạng thái hiện tại (salesOpen, salesClosed, published, …). */
  status: string;
  /** Thông tin mở/đóng bán. */
  sales: {
    /** Thời điểm mở bán (ISO 8601). Undefined nếu chưa mở. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
  /** Kết quả quay (chỉ có sau khi publish). */
  result?: {
    /** 3 số kết quả (1-6). */
    numbers: number[];
    /** Tổng 3 số = numbers[0] + numbers[1] + numbers[2]. */
    sum: number;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Thống kê tham gia. */
  stats?: {
    /** Tổng số entry đã đặt trong kỳ. */
    ticketEntryCount: number;
    /** Tổng tiền đặt cược (VND). */
    totalSalesAmount: number;
  };
}

export interface GetCurrentDrawOutput {
  /** Kỳ quay hiện tại gần nhất (null nếu không có). */
  currentDraw: CurrentDrawInfo | null;
  /** Danh sách tất cả kỳ quay đang hoạt động (salesOpen/salesClosed). */
  activeDraws: CurrentDrawInfo[];
}
