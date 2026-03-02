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
  /** ID kỳ quay hiện tại. */
  drawId: string;
  /** Ngày quay, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ quay trong năm. */
  drawNo: number;
  /** Giờ quay, định dạng HH:mm (giờ VN). */
  drawTime: string;
  /** Trạng thái hiện tại (scheduled / salesOpen / salesClosed / published / ...). */
  status: string;
  /** Thông tin thời gian mở/đóng bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO 8601). Undefined nếu chưa mở bán. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
  /** Jackpot 1 hiện tại (VND) — đọc từ active cycle. */
  jackpot1CurrentAmount: number;
  /** Jackpot 2 hiện tại (VND) — đọc từ active cycle. */
  jackpot2CurrentAmount: number;
  /** Dự kiến kỳ chia giải (split cycle). */
  splitCycleIntent: boolean;
  /** Thống kê bán vé (chỉ có khi draw đang mở bán hoặc đã đóng). */
  stats?: {
    /** Tổng số entries đã đặt cược. */
    totalEntries: number;
    /** Tổng số dòng (lines) từ tất cả entries. */
    totalLines: number;
    /** Tổng doanh thu bán vé (VND). */
    totalSalesAmount?: number;
  };
}

export interface GetCurrentDrawOutput {
  /** Kỳ active đầu tiên (backward compat). */
  currentDraw: CurrentDrawInfo | null;
  /** Tất cả các kỳ active, sorted theo drawDate asc. */
  activeDraws: CurrentDrawInfo[];
  /** Jackpot 1 hiện tại từ active cycle (VND). */
  jackpot1CurrentAmount: number;
  /** Jackpot 2 hiện tại từ active cycle (VND). */
  jackpot2CurrentAmount: number;
  /** Kỳ đã settle gần nhất. */
  lastSettledDraw: {
    /** ID kỳ quay đã settle gần nhất. */
    drawId: string;
    /** Ngày quay, định dạng YYYY-MM-DD. */
    drawDate: string;
    /** Số thứ tự kỳ quay. */
    drawNo: number;
    /** Giờ quay, định dạng HH:mm. */
    drawTime: string;
    /** Kết quả quay (nếu đã công bố). */
    result?: {
      /** 6 số chính trúng thưởng đã sắp xếp tăng dần. */
      winningMain: number[];
      /** Số bonus (1 số từ 49 số còn lại sau khi chọn 6 số chính). */
      bonusNumber: number;
      /** Thời điểm công bố kết quả (ISO 8601). */
      publishedAt: string;
    };
    /** Thông tin jackpot của kỳ đã settle. */
    jackpot?: {
      /** Số dư Jackpot 1 đầu kỳ (VND). */
      openingJackpot1: number;
      /** Số dư Jackpot 1 cuối kỳ (VND). */
      closingJackpot1: number;
      /** Số dư Jackpot 2 đầu kỳ (VND). */
      openingJackpot2: number;
      /** Số dư Jackpot 2 cuối kỳ (VND). */
      closingJackpot2: number;
      /** Có phải kỳ chia giải (split cycle) hay không. */
      isSplitCycle: boolean;
    };
  } | null;
}
