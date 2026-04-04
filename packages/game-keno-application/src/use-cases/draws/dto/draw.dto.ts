import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawEntity } from "@megawin/game-keno/entities";

// ─────────────────────────────────────────────
// CreateDraw (batch)
// ─────────────────────────────────────────────

export interface CreateDrawSlotInput {
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: string;
  /**
   * Giờ quay ISO 8601 có timezone offset (ví dụ: "2026-03-20T06:08:00+07:00").
   * closeAt tính tự động phía server: drawTime − play.salesCloseBeforeSeconds.
   */
  drawTime: string;
  /** Mở bán ngay sau khi tạo. */
  openNow: boolean;
}

export interface CreateDrawInput {
  /** Danh sách kỳ cần tạo (1-30). */
  draws: CreateDrawSlotInput[];
}

export interface CreateDrawOutputItem {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  closeAt: string;
  financialDate: string;
  status: string;
}

export interface CreateDrawOutput {
  draws: CreateDrawOutputItem[];
}

// ─────────────────────────────────────────────
// PreviewDraws
// ─────────────────────────────────────────────

export interface PreviewDrawsInput {
  /** Số kỳ muốn preview. */
  count: number;
}

export interface PreviewDrawItem {
  drawNo: number;
  /** Ngày quay (YYYY-MM-DD) — có thể khác nhau khi cross-day rollover. */
  drawDate: string;
  drawTime: string;
  closeAt: string;
  /** salesOpen nếu trong [firstDrawTime, lastDrawTime], scheduled nếu ngoài. */
  status: string;
}

export interface PreviewDrawsOutput {
  draws: PreviewDrawItem[];
}

// ─────────────────────────────────────────────
// OpenSales / CloseSales / VoidDraw
// ─────────────────────────────────────────────

export interface DrawIdInput {
  drawId: string;
}

export interface DrawTransitionOutput {
  drawId: string;
  previousStatus: string;
  currentStatus: string;
}

// ─────────────────────────────────────────────
// PublishResult
// ─────────────────────────────────────────────

export interface PublishResultInput {
  drawId: string;
  /** 20 số trúng thưởng ("01"-"80"), unique, giữ nguyên thứ tự quay. */
  winningNumbers: string[];
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface PublishResultOutput {
  drawId: string;
  status: string;
  result: {
    winningNumbers: string[];
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  drawId: string;
  /** ARN của Step Function kết sổ Keno. */
  KENO_SETTLE_SFN_ARN: string;
}

export interface TriggerSettleOutput {
  drawId: string;
  status: string;
  totalEntries: number;
}

// ─────────────────────────────────────────────
// ListDraws
// ─────────────────────────────────────────────

export interface ListDrawsInput {
  status?: DrawStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  size?: number;
}

export interface DrawSummary {
  id: string;
  drawId: string;
  drawDate: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate?: string;
  drawNo: number;
  drawTime: string;
  /** Thời điểm đóng bán (ISO 8601). */
  closeAt?: string;
  /** Thời điểm mở bán (ISO 8601). */
  openAt?: string;
  status: string;
  hasResult: boolean;
  /** 20 số trúng thưởng (01-80), chỉ có sau khi published. */
  result?: { winningNumbers: string[] };
  ticketEntryCount?: number;
  totalRevenue?: number;
  /** Tổng tiền trả thưởng thực tế (VND) — từ stats.totalPayoutAmount. */
  totalPayout?: number;
  /** Thông tin tài chính tổng hợp sau settle. */
  financial?: {
    /** Tổng tiền thưởng đã trả. */
    totalPrizes: number;
    /** Tổng hoa hồng đại lý (VND). */
    totalAgentCommission: number;
    /** Lợi nhuận thực tế công ty (VND) = revenue - prizes - commission. */
    companyTake: number;
  };
}

export interface ListDrawsOutput {
  draws: DrawSummary[];
  page: number;
  size: number;
}

// ─────────────────────────────────────────────
// GetDrawDetail
// ─────────────────────────────────────────────

export interface GetDrawDetailInput {
  drawId: string;
}

export interface GetDrawDetailOutput {
  draw: DrawEntity;
}
