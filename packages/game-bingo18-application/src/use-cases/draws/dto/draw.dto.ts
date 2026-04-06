import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawEntity } from "@megawin/game-bingo18/entities";

// ─────────────────────────────────────────────
// CreateDraw (batch)
// ─────────────────────────────────────────────

export interface CreateDrawInputItem {
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1-~160). */
  drawNo: number;
  /** Thời điểm quay (ISO 8601, timezone +07:00). */
  drawTime: string;
  /** Mở bán ngay sau khi tạo. */
  openNow: boolean;
}

export interface CreateDrawInput {
  /** Danh sách kỳ quay cần tạo. */
  draws: CreateDrawInputItem[];
}

export interface CreateDrawOutputItem {
  /** ID duy nhất của kỳ quay (format: bingo18_{drawDate}_{drawNo}). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1, 2, 3, …). */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Thời điểm đóng bán (ISO 8601) – trước drawTime một khoảng cấu hình. */
  closeAt: string;
  /** Ngày tài chính áp dụng cho kỳ này (YYYY-MM-DD). */
  financialDate: string;
  /** Trạng thái ban đầu của kỳ quay (scheduled | salesOpen). */
  status: string;
}

export interface CreateDrawOutput {
  /** Danh sách các kỳ quay vừa được tạo. */
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
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Ngày quay (YYYY-MM-DD) — có thể khác nhau khi cross-day rollover. */
  drawDate: string;
  /** Thời điểm quay dự kiến (ISO 8601). */
  drawTime: string;
  /** Thời điểm đóng bán dự kiến (ISO 8601). */
  closeAt: string;
  /** salesOpen nếu trong [firstDrawTime, lastDrawTime], scheduled nếu ngoài. */
  status: string;
}

export interface PreviewDrawsOutput {
  /** Danh sách kỳ quay preview (chưa lưu DB). */
  draws: PreviewDrawItem[];
}

// ─────────────────────────────────────────────
// OpenSales / CloseSales / VoidDraw
// ─────────────────────────────────────────────

export interface DrawIdInput {
  /** ID của kỳ quay cần thao tác. */
  drawId: string;
}

export interface DrawTransitionOutput {
  /** ID kỳ quay đã chuyển trạng thái. */
  drawId: string;
  /** Trạng thái trước khi chuyển. */
  previousStatus: string;
  /** Trạng thái sau khi chuyển. */
  currentStatus: string;
}

// ─────────────────────────────────────────────
// PublishResult
// ─────────────────────────────────────────────

export interface PublishResultInput {
  /** ID kỳ quay cần công bố kết quả. */
  drawId: string;
  /** 3 số kết quả (mỗi số 1-6), ví dụ [3, 5, 2]. */
  numbers: number[];
  /** Tham chiếu kết quả Vietlott (nếu đồng bộ từ Vietlott). */
  vietlottRef?: {
    /** Mã kỳ quay Vietlott. */
    drawPeriod: string;
    /** Ngày quay Vietlott (YYYY-MM-DD). */
    drawDate: string;
  };
}

export interface PublishResultOutput {
  /** ID kỳ quay đã công bố. */
  drawId: string;
  /** Trạng thái sau khi công bố (published). */
  status: string;
  /** Kết quả quay. */
  result: {
    /** 3 số kết quả (1-6). */
    numbers: number[];
    /** Tổng 3 số = numbers[0] + numbers[1] + numbers[2]. */
    sum: number;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  /** ID kỳ quay cần trigger settle. */
  drawId: string;

  /** ARN của Step Function để kết sổ. */
  SETTLE_SFN_ARN: string;
}

export interface TriggerSettleOutput {
  /** ID kỳ quay đang settle. */
  drawId: string;
  /** Trạng thái sau khi trigger (settling). */
  status: string;
}

// ─────────────────────────────────────────────
// ListDraws
// ─────────────────────────────────────────────

export interface ListDrawsInput {
  /** Lọc theo trạng thái kỳ quay (scheduled, salesOpen, salesClosed, …). */
  status?: DrawStatus;
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). */
  fromDate?: string;
  /** Lọc đến ngày (YYYY-MM-DD, inclusive). */
  toDate?: string;
  /** Trang hiện tại (1-based). Default 1. */
  page?: number;
  /** Số bản ghi mỗi trang. Default 20. */
  size?: number;
}

export interface DrawSummary {
  /** MongoDB document ID. */
  id: string;
  /** ID logic kỳ quay (bingo18_{drawDate}_{drawNo}). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate?: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Thời điểm đóng bán (ISO 8601). */
  closeAt?: string;
  /** Thời điểm mở bán (ISO 8601). */
  openAt?: string;
  /** Trạng thái hiện tại của kỳ quay. */
  status: string;
  /** true nếu đã có kết quả quay (numbers + sum). */
  hasResult: boolean;
  /** Kết quả quay — 3 số xúc xắc và tổng. */
  result?: {
    /** 3 số xúc xắc (1-6). */
    diceNumbers: number[];
    /** Tổng 3 số (3-18). */
    sum: number;
  };
  /** Số lượng entry đã tham gia kỳ này. */
  ticketEntryCount?: number;
  /** Tổng doanh thu (VND) từ entries. */
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
  /** Danh sách kỳ quay tóm tắt. */
  draws: DrawSummary[];
  /** Trang hiện tại. */
  page: number;
  /** Kích thước trang. */
  size: number;
}

// ─────────────────────────────────────────────
// GetDrawDetail
// ─────────────────────────────────────────────

export interface GetDrawDetailInput {
  /** ID kỳ quay cần xem chi tiết. */
  drawId: string;
}

export interface GetDrawDetailOutput {
  /** Toàn bộ thông tin kỳ quay (entity đầy đủ). */
  draw: DrawEntity;
}
