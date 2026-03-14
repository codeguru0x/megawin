import type { DrawStatus } from "@megawin/game-core/entities";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities";
import type { DrawEntity } from "@megawin/game-max3dpro/entities";;

// ─────────────────────────────────────────────
// CreateDraws (batch – tạo nhiều kỳ liên tiếp)
// ─────────────────────────────────────────────

export interface CreateDrawsInput {
  /** Số kỳ cần tạo (1-12). */
  count: number;
}

export interface CreateDrawsOutputItem {
  /** Mã định danh kỳ quay (format: MAX3DPRO-YYYYMMDD-NN). */
  drawId: string;
  /** Ngày quay thưởng (ISO date, vd: 2024-06-15). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Giờ quay thưởng dự kiến (ISO datetime). */
  drawTime: string;
  /** Thời điểm đóng bán vé (ISO datetime). */
  closeAt: string;
  /** Ngày tài chính áp dụng cho kỳ quay. */
  financialDate: string;
  /** Trạng thái kỳ quay sau khi tạo. */
  status: string;
}

export interface CreateDrawsOutput {
  /** Danh sách các kỳ quay vừa được tạo. */
  draws: CreateDrawsOutputItem[];
}

// ─────────────────────────────────────────────
// PreviewDraws
// ─────────────────────────────────────────────

export interface PreviewDrawsInput {
  /** Số kỳ cần xem trước. */
  count: number;
}

export interface PreviewDrawItem {
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Giờ quay thưởng dự kiến (ISO datetime). */
  drawTime: string;
  /** Thời điểm đóng bán vé (ISO datetime). */
  closeAt: string;
  /** Trạng thái dự kiến của kỳ quay. */
  status: string;
}

export interface PreviewDrawsOutput {
  /** Danh sách kỳ quay xem trước. */
  draws: PreviewDrawItem[];
}

// ─────────────────────────────────────────────
// OpenSales / CloseSales / VoidDraw
// ─────────────────────────────────────────────

export interface DrawIdInput {
  /** Mã định danh kỳ quay cần thao tác. */
  drawId: string;
}

export interface DrawTransitionOutput {
  /** Mã định danh kỳ quay. */
  drawId: string;
  /** Trạng thái trước khi chuyển đổi. */
  previousStatus: string;
  /** Trạng thái sau khi chuyển đổi. */
  currentStatus: string;
}

// ─────────────────────────────────────────────
// PublishResult
// ─────────────────────────────────────────────

export interface PublishResultInput {
  /** Mã định danh kỳ quay cần công bố kết quả. */
  drawId: string;
  /** Kết quả quay thưởng: 20 bộ ba số (2 ĐB + 4 Nhất + 6 Nhì + 8 Ba). */
  result: Max3dproDrawResult;
  /** Tham chiếu kỳ quay Vietlott (optional). */
  vietlottRef?: {
    /** Mã kỳ quay Vietlott (vd: "00123"). */
    drawPeriod: string;
    /** Ngày quay của Vietlott (ISO date). */
    drawDate: string;
  };
}

export interface PublishResultOutput {
  /** Mã định danh kỳ quay đã công bố. */
  drawId: string;
  /** Trạng thái kỳ quay sau khi công bố kết quả. */
  status: string;
  /** Kết quả quay thưởng kèm thời điểm công bố. */
  result: Max3dproDrawResult & {
    /** Thời điểm công bố kết quả (ISO datetime). */
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  /** Mã định danh kỳ quay cần đối soát. */
  drawId: string;
}

export interface TriggerSettleOutput {
  /** Mã định danh kỳ quay đã đối soát. */
  drawId: string;
  /** Trạng thái kỳ quay sau khi đối soát. */
  status: string;
  /** Tổng số lượt đặt cược (ticket entries) cần đối soát. */
  totalEntries: number;
  /** Tổng cặp (pairs) cần settle. */
  totalLines: number;
}

// ─────────────────────────────────────────────
// ListDraws
// ─────────────────────────────────────────────

export interface ListDrawsInput {
  /** Lọc theo trạng thái kỳ quay. */
  status?: DrawStatus;
  /** Lọc từ ngày (ISO date, bao gồm). */
  fromDate?: string;
  /** Lọc đến ngày (ISO date, bao gồm). */
  toDate?: string;
  /** Số trang hiện tại (bắt đầu từ 1). */
  page?: number;
  /** Số bản ghi mỗi trang. */
  size?: number;
}

export interface DrawSummary {
  /** ID nội bộ (primary key). */
  id: string;
  /** Mã định danh kỳ quay (format: MAX3DPRO-YYYYMMDD-NN). */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Giờ quay thưởng dự kiến (ISO datetime). */
  drawTime: string;
  /** Trạng thái hiện tại của kỳ quay. */
  status: string;
  /** Đã có kết quả quay thưởng hay chưa. */
  hasResult: boolean;
  /** Số lượt đặt cược (ticket entries) trong kỳ. */
  ticketEntryCount?: number;
  /** Tổng doanh thu bán vé của kỳ. */
  totalRevenue?: number;
  /** Thông tin tài chính tổng hợp của kỳ quay. */
  financial?: {
    /** Tổng tiền thưởng cố định đã trả. */
    totalFixedPrizes: number;
    /** Tổng hoa hồng đại lý. */
    totalAgentCommission: number;
    /** Phần lợi nhuận công ty giữ lại. */
    companyTake: number;
  };
}

export interface ListDrawsOutput {
  /** Danh sách kỳ quay tóm tắt. */
  draws: DrawSummary[];
  /** Số trang hiện tại. */
  page: number;
  /** Số bản ghi mỗi trang. */
  size: number;
}

// ─────────────────────────────────────────────
// GetDrawDetail
// ─────────────────────────────────────────────

export interface GetDrawDetailInput {
  /** Mã định danh kỳ quay cần xem chi tiết. */
  drawId: string;
}

export interface GetDrawDetailOutput {
  /** Thông tin chi tiết đầy đủ của kỳ quay. */
  draw: DrawEntity;
}
