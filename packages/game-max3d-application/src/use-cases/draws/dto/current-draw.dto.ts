import type { DrawStatus } from "@megawin/game-core/entities";
import type { Max3dDrawResult } from "@megawin/game-max3d/entities";

// ─────────────────────────────────────────────
// GetCurrentDraw
// ─────────────────────────────────────────────

export interface GetCurrentDrawInput {
  /**
   * Cho phép trả draw ở các status cụ thể.
   * Nếu không truyền, mặc định trả tất cả draw active.
   */
  allowStatuses?: DrawStatus[];
}

export interface CurrentDrawInfo {
  /** Mã định danh kỳ quay (format: MAX3D-YYYYMMDD-NN). */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Giờ quay thưởng dự kiến (ISO datetime). */
  drawTime: string;
  /** Trạng thái hiện tại của kỳ quay. */
  status: string;
  /** Thông tin thời gian mở/đóng bán vé. */
  sales: {
    /** Thời điểm mở bán vé (ISO datetime, nếu có). */
    openAt?: string;
    /** Thời điểm đóng bán vé (ISO datetime). */
    closeAt: string;
  };
  /** Thống kê bán vé của kỳ quay (nếu có). */
  stats?: {
    /** Số lượt đặt cược (ticket entries). */
    ticketEntryCount: number;
    /** Tổng số dòng chơi (lines). */
    totalLineCount: number;
    /** Tổng doanh thu bán vé. */
    totalSalesAmount: number;
  };
}

export interface GetCurrentDrawOutput {
  /** Kỳ active đầu tiên (backward compat). */
  currentDraw: CurrentDrawInfo | null;
  /** Tất cả các kỳ active, sorted theo drawDate+drawNo asc. */
  activeDraws: CurrentDrawInfo[];
  /** Kỳ đã settle gần nhất. */
  lastSettledDraw: {
    /** Mã định danh kỳ quay đã settle. */
    drawId: string;
    /** Ngày quay thưởng (ISO date). */
    drawDate: string;
    /** Số thứ tự kỳ quay trong ngày. */
    drawNo: number;
    /** Giờ quay thưởng (ISO datetime). */
    drawTime: string;
    /** Kết quả quay thưởng kèm thời điểm công bố (nếu có). */
    result?: Max3dDrawResult & {
      /** Thời điểm công bố kết quả (ISO datetime). */
      publishedAt: string;
    };
  } | null;
}
