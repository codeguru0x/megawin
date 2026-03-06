import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawNo } from "@megawin/game-lotto535/entities";
import type { DrawEntity } from "../../../infras/mappers/draw-mapper";

// ─────────────────────────────────────────────
// CreateDraws (batch – tạo nhiều kỳ liên tiếp)
// ─────────────────────────────────────────────

export interface CreateDrawsInput {
  /** Số kỳ cần tạo (1-12). */
  count: number;
}

export interface CreateDrawsOutputItem {
  /** Mã định danh kỳ quay (UUID). */
  drawId: string;
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = sáng 13h, 2 = tối 21h). */
  drawNo: number;
  /** Giờ quay dự kiến, format HH:mm. */
  drawTime: string;
  /** Thời điểm đóng bán (ISO 8601). */
  closeAt: string;
  /** Ngày tài chính (YYYY-MM-DD) — dùng cho báo cáo và đối soát. */
  financialDate: string;
  /** Trạng thái kỳ quay sau khi tạo (thường là "scheduled"). */
  status: string;
}

export interface CreateDrawsOutput {
  /** Danh sách các kỳ quay đã được tạo thành công. */
  draws: CreateDrawsOutputItem[];
}

// ─────────────────────────────────────────────
// PreviewDraws
// ─────────────────────────────────────────────

export interface PreviewDrawsInput {
  /** Số kỳ muốn xem trước (1-12). */
  count: number;
}

export interface PreviewDrawItem {
  /** Ngày quay dự kiến, format YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = sáng, 2 = tối). */
  drawNo: number;
  /** Giờ quay dự kiến, format HH:mm. */
  drawTime: string;
  /** Thời điểm đóng bán dự kiến (ISO 8601). */
  closeAt: string;
  /** Trạng thái dự kiến (thường là "scheduled"). */
  status: string;
}

export interface PreviewDrawsOutput {
  /** Danh sách kỳ quay xem trước (chưa lưu DB). */
  draws: PreviewDrawItem[];
}

// ─────────────────────────────────────────────
// OpenSales / CloseSales / VoidDraw
// ─────────────────────────────────────────────

export interface DrawIdInput {
  /** Mã định danh kỳ quay cần thao tác (UUID). */
  drawId: string;
}

export interface DrawTransitionOutput {
  /** Mã định danh kỳ quay. */
  drawId: string;
  /** Trạng thái trước khi chuyển đổi. */
  previousStatus: string;
  /** Trạng thái sau khi chuyển đổi thành công. */
  currentStatus: string;
}

// ─────────────────────────────────────────────
// PublishResult
// ─────────────────────────────────────────────

export interface PublishResultInput {
  /** Mã kỳ quay cần công bố kết quả. */
  drawId: string;
  /** 5 số chính trúng thưởng — string zero-padded ("01"-"35"), unsorted OK. */
  winningMain: string[];
  /** 1 số đặc biệt trúng thưởng — string zero-padded ("01"-"12"). */
  winningSpecial: string;
  /** Tham chiếu kỳ quay Vietlott (optional). */
  vietlottRef?: {
    /** Mã kỳ quay bên Vietlott (vd: "00123"). */
    drawPeriod: string;
    /** Ngày quay bên Vietlott, format YYYY-MM-DD. */
    drawDate: string;
    /** Phiên quay trong ngày (1 = sáng, 2 = tối). */
    drawSession: number;
  };
}

export interface PublishResultOutput {
  /** Mã kỳ quay đã công bố. */
  drawId: string;
  /** Trạng thái sau khi công bố (thường là "published"). */
  status: string;
  /** Kết quả quay đã được lưu. */
  result: {
    /** 5 số chính trúng thưởng — giữ nguyên thứ tự quay (draw order). */
    winningMain: string[];
    /** Số đặc biệt trúng thưởng. */
    winningSpecial: string;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  /** Mã kỳ quay cần kích hoạt settle. */
  drawId: string;
  /** ARN của Step Function kết sổ Lotto 5/35. */
  LOTTO535_SETTLE_SFN_ARN: string;
}

export interface TriggerSettleOutput {
  /** Mã kỳ quay. */
  drawId: string;
  /** Trạng thái sau khi trigger (thường là "settling"). */
  status: string;
  /** Kỳ này có phải kỳ chia Jackpot hay không. */
  isSplitCycle: boolean;
}

// ─────────────────────────────────────────────
// ListDraws
// ─────────────────────────────────────────────

export interface ListDrawsInput {
  /** Lọc theo trạng thái kỳ quay (optional). */
  status?: DrawStatus;
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). */
  fromDate?: string;
  /** Lọc đến ngày (YYYY-MM-DD, inclusive). */
  toDate?: string;
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số lượng mỗi trang (mặc định 20). */
  size?: number;
}

export interface DrawSummary {
  /** MongoDB document ID. */
  id: string;
  /** Mã định danh kỳ quay (UUID). */
  drawId: string;
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = sáng 13h, 2 = tối 21h). */
  drawNo: DrawNo;
  /** Giờ quay, format HH:mm. */
  drawTime: string;
  /** Trạng thái hiện tại của kỳ quay. */
  status: string;
  /** Jackpot opening — chỉ có cho draws đã settle. */
  jackpotAmount?: number;
  /** Số tiền Jackpot cuối kỳ (VND) — sau khi tính contribution/winner. */
  jackpotClosingAmount?: number;
  /** Kỳ này có phải kỳ chia Jackpot hay không. */
  isSplitCycle: boolean;
  /** Đã có kết quả quay chưa (winningMain + winningSpecial). */
  hasResult: boolean;
  /** Tổng số entries (vé × kỳ) tham gia kỳ quay này. */
  ticketEntryCount?: number;
  /** Tổng doanh thu kỳ quay (VND) = Σ(entry.amount). */
  totalRevenue?: number;
  /** Thông tin tài chính tổng hợp — chỉ có sau khi settle. */
  financial?: {
    /** Tổng giải thưởng cố định đã trả (VND) — không bao gồm Jackpot. */
    totalFixedPrizes: number;
    /** Tổng hoa hồng đại lý (VND) = Σ(tenant.revenue × tenant.commissionRate). */
    totalAgentCommission: number;
    /**
     * Phần công ty thu về (VND).
     * Công thức: companyTake = totalRevenue × companyRate − totalFixedPrizes − totalAgentCommission
     * (có thể bị cắt nếu vượt quá phần còn lại).
     */
    companyTake: number;
    /**
     * Phần đóng góp vào quỹ Jackpot (VND).
     * Công thức: jackpotContribution = totalRevenue − totalFixedPrizes − totalAgentCommission − companyTake
     */
    jackpotContribution: number;
  };
}

export interface ListDrawsOutput {
  /** Danh sách kỳ quay tóm tắt. */
  draws: DrawSummary[];
  /** Trang hiện tại (1-based). */
  page: number;
  /** Số lượng mỗi trang. */
  size: number;
}

// ─────────────────────────────────────────────
// GetDrawDetail
// ─────────────────────────────────────────────

export interface GetDrawDetailInput {
  /** Mã kỳ quay cần xem chi tiết. */
  drawId: string;
}

export interface GetDrawDetailOutput {
  /** Toàn bộ dữ liệu kỳ quay (entity đầy đủ từ DB). */
  draw: DrawEntity;
}
