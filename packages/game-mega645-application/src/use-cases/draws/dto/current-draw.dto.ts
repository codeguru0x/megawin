import type { DrawStatus } from "@megawin/game-core/entities";

// ─────────────────────────────────────────────
// GetCurrentDraw
// ─────────────────────────────────────────────

export interface GetCurrentDrawInput {
  /** Danh sách trạng thái cho phép khi truy vấn kỳ hiện tại (mặc định: tất cả trạng thái active). */
  allowStatuses?: DrawStatus[];
}

export interface CurrentDrawInfo {
  /** ID duy nhất của kỳ quay. */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Giờ quay thưởng, ví dụ "18:00". */
  drawTime: string;
  /** Trạng thái hiện tại của kỳ quay. */
  status: string;
  /** Thông tin thời gian mở/đóng bán vé. */
  sales: {
    /** Thời điểm mở bán vé (ISO datetime, undefined nếu chưa mở). */
    openAt?: string;
    /** Thời điểm đóng bán vé (ISO datetime). */
    closeAt: string;
  };
  /** Jackpot hiện tại (VND) — đọc từ active cycle. */
  jackpotCurrentAmount: number;
  /** Dự kiến kỳ chia giải (split cycle) — true nếu jackpot đạt ngưỡng split. */
  splitCycleIntent: boolean;
  /** Thống kê bán vé (chỉ có khi kỳ đã mở bán). */
  stats?: {
    /** Tổng số entry (lượt tham gia). */
    ticketEntryCount: number;
    /** Tổng số dòng (lines) đã expand từ các board. */
    totalLineCount: number;
    /** Tổng doanh thu bán vé (VND). */
    totalSalesAmount: number;
  };
}

export interface GetCurrentDrawOutput {
  /** Kỳ active đầu tiên (backward compat). */
  currentDraw: CurrentDrawInfo | null;
  /** Tất cả các kỳ active, sorted theo drawDate asc. */
  activeDraws: CurrentDrawInfo[];
  /** Jackpot hiện tại từ active cycle (VND). */
  jackpotCurrentAmount: number;
  /** Kỳ đã settle gần nhất. */
  lastSettledDraw: {
    /** ID kỳ quay đã settle. */
    drawId: string;
    /** Ngày quay thưởng (ISO date). */
    drawDate: string;
    /** Số thứ tự kỳ quay. */
    drawNo: number;
    /** Giờ quay thưởng. */
    drawTime: string;
    /** Kết quả quay thưởng (nếu có). */
    result?: {
      /** 6 số chính trúng thưởng (1-45). */
      winningMain: number[];
      /** Thời điểm công bố kết quả (ISO datetime). */
      publishedAt: string;
    };
    /** Thông tin jackpot của kỳ đã settle. */
    jackpot?: {
      /** Giá trị jackpot đầu kỳ (VND). */
      openingAmount: number;
      /** Giá trị jackpot cuối kỳ (VND). */
      closingAmount: number;
      /** Có phải kỳ chia jackpot không. */
      isSplitCycle: boolean;
    };
  } | null;
}
