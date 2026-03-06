import type { DrawStatus } from "@megawin/game-core/entities";

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
  /** Mã định danh kỳ quay (UUID). */
  drawId: string;
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = sáng 13h, 2 = tối 21h). */
  drawNo: number;
  /** Giờ quay, format HH:mm. */
  drawTime: string;
  /** Trạng thái hiện tại (vd: "salesOpen", "salesClosed"). */
  status: string;
  /** Thông tin thời gian bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO 8601) — có thể undefined nếu chưa mở. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
  /** Jackpot hiện tại (VND) — đọc từ active cycle. */
  jackpotCurrentAmount: number;
  /** Dự kiến kỳ chia giải. */
  splitCycleIntent: boolean;
  /** Thống kê bán vé realtime (chỉ có khi draw đang mở bán). */
  stats?: {
    /** Tổng số entries (vé × kỳ) đã đặt. */
    ticketEntryCount: number;
    /** Tổng số dòng (lines) từ tất cả entries. */
    totalLineCount: number;
    /** Tổng doanh thu (VND) = Σ(entry.amount). */
    totalSalesAmount: number;
  };
}

export interface GetCurrentDrawOutput {
  /** Kỳ active đầu tiên (backward compat). */
  currentDraw: CurrentDrawInfo | null;
  /** Tất cả các kỳ active, sorted theo drawDate+drawNo asc. */
  activeDraws: CurrentDrawInfo[];
  /** Jackpot hiện tại từ active cycle (VND). */
  jackpotCurrentAmount: number;
  /** Kỳ đã settle gần nhất. */
  lastSettledDraw: {
    /** Mã kỳ quay đã settle. */
    drawId: string;
    /** Ngày quay (YYYY-MM-DD). */
    drawDate: string;
    /** Số thứ tự kỳ trong ngày. */
    drawNo: number;
    /** Giờ quay (HH:mm). */
    drawTime: string;
    /** Kết quả quay — có thể undefined nếu chưa công bố. */
    result?: {
      /** 5 số chính trúng thưởng (sorted, zero-padded "01"-"35"). */
      winningMain: string[];
      /** Số đặc biệt trúng thưởng ("01"-"12"). */
      winningSpecial: string;
      /** Thời điểm công bố (ISO 8601). */
      publishedAt: string;
    };
    /** Thông tin Jackpot kỳ đã settle. */
    jackpot?: {
      /** Số tiền Jackpot đầu kỳ (VND). */
      openingAmount: number;
      /** Số tiền Jackpot cuối kỳ (VND). */
      closingAmount: number;
      /** Kỳ này có chia Jackpot hay không. */
      isSplitCycle: boolean;
    };
  } | null;
}
