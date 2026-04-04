import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawNo } from "@megawin/game-power655/entities";
import type { DrawEntity } from "@megawin/game-power655/entities";

// ─────────────────────────────────────────────
// CreateDraws (batch – tạo nhiều kỳ liên tiếp)
// ─────────────────────────────────────────────

export interface CreateDrawSlotInput {
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (Power 6/55: luôn là 1). */
  drawNo: number;
  /**
   * Giờ quay, ISO 8601 có timezone offset (ví dụ: "2026-04-01T18:00:00+07:00").
   * closeAt tính tự động phía server: drawTime − play.salesCloseBeforeMinutes.
   */
  drawTime: string;
  /** Mở bán ngay sau khi tạo. */
  openNow: boolean;
}

export interface CreateDrawsInput {
  /** Danh sách kỳ cần tạo (1-12). */
  draws: CreateDrawSlotInput[];
}

export interface CreateDrawsOutputItem {
  /** ID duy nhất của kỳ quay vừa tạo. */
  drawId: string;
  /** Ngày quay, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ quay trong năm. */
  drawNo: number;
  /** Giờ quay dự kiến, định dạng HH:mm (giờ VN). */
  drawTime: string;
  /** Thời điểm đóng nhận cược (ISO 8601). */
  closeAt: string;
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
  /** Số kỳ cần xem trước (1-12). */
  count: number;
}

export interface PreviewDrawItem {
  /** Ngày quay dự kiến, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ quay trong năm. */
  drawNo: number;
  /** Giờ quay dự kiến, định dạng HH:mm (giờ VN). */
  drawTime: string;
  /** Thời điểm đóng nhận cược dự kiến (ISO 8601). */
  closeAt: string;
  /** Trạng thái dự kiến của kỳ quay (thường là "scheduled"). */
  status: string;
}

export interface PreviewDrawsOutput {
  /** Danh sách kỳ quay xem trước (chưa được lưu vào DB). */
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
  /** ID của kỳ quay đã chuyển trạng thái. */
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
  /** 6 số chính trúng thưởng ("01"-"55"), unique, giữ nguyên thứ tự quay. */
  winningMain: string[];
  /** 1 số bonus number ("01"-"55"), phải khác 6 số chính. Chọn từ 49 số còn lại. */
  bonusNumber: string;
  /** Tham chiếu kỳ quay Vietlott (optional). */
  vietlottRef?: {
    /** Mã kỳ quay Vietlott (ví dụ: "00123"). */
    drawPeriod: string;
    /** Ngày quay Vietlott, định dạng YYYY-MM-DD. */
    drawDate: string;
    /** Nguồn dữ liệu kết quả (ví dụ: "vietlott.vn", "manual"). */
    source?: string;
  };
}

export interface PublishResultOutput {
  /** ID kỳ quay đã công bố kết quả. */
  drawId: string;
  /** Trạng thái mới sau khi công bố (thường là "published"). */
  status: string;
  /** Kết quả quay đã được công bố. */
  result: {
    /** 6 số chính trúng thưởng theo thứ tự quay (draw order). */
    winningMain: string[];
    /** Số bonus (1 số từ 49 số còn lại). */
    bonusNumber: string;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
}

// ─────────────────────────────────────────────
// TriggerSettle
// ─────────────────────────────────────────────

export interface TriggerSettleInput {
  /** ID kỳ quay cần bắt đầu settle. */
  drawId: string;
}

export interface TriggerSettleOutput {
  /** ID kỳ quay đang được settle. */
  drawId: string;
  /** Trạng thái mới sau trigger (thường là "settling"). */
  status: string;
  /** Tổng entries sẽ được settle bởi worker. */
  totalEntries: number;
  /** Tổng số dòng (lines) cần xử lý từ tất cả entries. */
  totalLines: number;
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
  /** ID nội bộ (MongoDB _id). */
  id: string;
  /** ID kỳ quay (business key, ví dụ: "POWER655-2025-001"). */
  drawId: string;
  /** Ngày quay, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Ngày tài chính (YYYY-MM-DD). Thường trùng drawDate. */
  financialDate: string;
  /** Số thứ tự kỳ quay trong năm. */
  drawNo: DrawNo;
  /** Giờ quay, ISO 8601 (giờ VN). */
  drawTime: string;
  /** Thời điểm mở bán (ISO 8601). Undefined nếu chưa mở bán. */
  openAt?: string;
  /** Thời điểm đóng bán (ISO 8601). */
  closeAt: string;
  /** Trạng thái hiện tại của kỳ quay. */
  status: string;
  /** Jackpot 1 opening — chỉ có cho draws đã settle. */
  jackpot1Amount?: number;
  /** Jackpot 2 opening — chỉ có cho draws đã settle. */
  jackpot2Amount?: number;
  /** Jackpot 1 closing — số dư JP1 sau khi settle (VND). */
  jackpot1ClosingAmount?: number;
  /** Jackpot 2 closing — số dư JP2 sau khi settle (VND). */
  jackpot2ClosingAmount?: number;
  /** Kỳ quay đã có kết quả (winningMain + bonusNumber) chưa. */
  hasResult: boolean;
  /** Kết quả quay số (chỉ có khi hasResult = true). */
  result?: {
    /** 6 số chính (01-55), zero-padded. */
    winningMain: string[];
    /** Số thưởng (bonus number), zero-padded. */
    bonusNumber: string;
  };
  /** Tổng số entries tham gia kỳ quay. */
  totalEntries?: number;
  /** Tổng doanh thu từ vé cược (VND). */
  totalRevenue?: number;
  /**
   * Tổng tiền thưởng thực tế đã trả (cố định + jackpot) (VND).
   * Chỉ có sau khi settle. Dùng để tính GGR chính xác.
   */
  totalPayout?: number;
  /** Thông tin tài chính chi tiết (chỉ có sau khi settle). */
  financial?: {
    /** Tổng giải thưởng cố định đã trả (tier1/tier2/tier3) (VND). */
    totalFixedPrizes: number;
    /** Tổng hoa hồng đại lý (VND). */
    totalAgentCommission: number;
    /** Phần lợi nhuận công ty dự kiến (VND). */
    companyTake: number;
    /**
     * Phần lợi nhuận công ty thực tế (VND).
     * = min(companyTake, max(revenue - prizes - commission, 0)).
     * Dùng cho cột "Lợi nhuận ròng" — đây là số tiền công ty thực tế giữ lại.
     */
    actualCompanyTake: number;
    /**
     * Đóng góp vào quỹ Jackpot 1 (VND).
     * Công thức: revenue × jp1Ratio.
     */
    jackpot1Contribution: number;
    /**
     * Đóng góp vào quỹ Jackpot 2 (VND).
     * Công thức: revenue × jp2Ratio + jp1Overflow (phần tràn từ JP1).
     */
    jackpot2Contribution: number;
  };
}

export interface ListDrawsOutput {
  /** Danh sách kỳ quay theo điều kiện lọc. */
  draws: DrawSummary[];
  /** Trang hiện tại. */
  page: number;
  /** Số lượng mỗi trang. */
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
  /** Entity đầy đủ của kỳ quay Power 6/55. */
  draw: DrawEntity;
}
