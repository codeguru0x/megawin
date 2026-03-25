import type { DrawStatus } from "@megawin/game-core/entities";
import type { DrawNo } from "@megawin/game-mega645/entities";
import type { DrawEntity } from "@megawin/game-mega645/entities";;

// ─────────────────────────────────────────────
// CreateDraws (batch – tạo nhiều kỳ liên tiếp)
// ─────────────────────────────────────────────

export interface CreateDrawSlotInput {
  /** Ngày quay, format YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày/năm (do client cung cấp theo preview). */
  drawNo: number;
  /**
   * Giờ quay, ISO 8601 có timezone offset (ví dụ: "2026-04-02T18:00:00+07:00").
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
  /** ID duy nhất của kỳ quay (UUID / ULID). */
  drawId: string;
  /** Ngày quay thưởng, định dạng ISO date (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ quay (tuần tự tăng dần). */
  drawNo: number;
  /** Giờ quay thưởng, ví dụ "18:00". */
  drawTime: string;
  /** Thời điểm đóng bán vé (ISO datetime). */
  closeAt: string;
  /** Ngày tài chính để ghi nhận doanh thu/chi phí. */
  financialDate: string;
  /** Trạng thái kỳ quay sau khi tạo (thường là "scheduled"). */
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
  /** Số kỳ cần xem trước (1-12). */
  count: number;
}

export interface PreviewDrawItem {
  /** Ngày quay thưởng dự kiến (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay dự kiến. */
  drawNo: number;
  /** Giờ quay thưởng dự kiến. */
  drawTime: string;
  /** Thời điểm đóng bán vé dự kiến (ISO datetime). */
  closeAt: string;
  /** Trạng thái dự kiến (thường là "scheduled"). */
  status: string;
}

export interface PreviewDrawsOutput {
  /** Danh sách kỳ quay xem trước (chưa lưu vào DB). */
  draws: PreviewDrawItem[];
}

// ─────────────────────────────────────────────
// OpenSales / CloseSales / VoidDraw
// ─────────────────────────────────────────────

export interface DrawIdInput {
  /** ID kỳ quay cần thao tác. */
  drawId: string;
}

export interface DrawTransitionOutput {
  /** ID kỳ quay đã chuyển trạng thái. */
  drawId: string;
  /** Trạng thái trước khi chuyển. */
  previousStatus: string;
  /** Trạng thái hiện tại sau khi chuyển. */
  currentStatus: string;
}

// ─────────────────────────────────────────────
// PublishResult
// ─────────────────────────────────────────────

export interface PublishResultInput {
  /** ID kỳ quay cần công bố kết quả. */
  drawId: string;
  /** 6 số chính trúng thưởng ("01"-"45"), unique, draw order. */
  winningNumbers: string[];
  /** Tham chiếu kỳ quay Vietlott (optional). */
  vietlottRef?: {
    /** Mã kỳ quay Vietlott gốc. */
    drawPeriod: string;
    /** Ngày quay của Vietlott (ISO date). */
    drawDate: string;
  };
}

export interface PublishResultOutput {
  /** ID kỳ quay đã công bố. */
  drawId: string;
  /** Trạng thái sau khi công bố (thường là "published"). */
  status: string;
  /** Kết quả quay thưởng đã công bố. */
  result: {
    /** 6 số chính trúng thưởng ("01"-"45"), draw order. */
    winningNumbers: string[];
    /** Thời điểm công bố kết quả (ISO datetime). */
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
  /** Trạng thái sau khi trigger (thường là "settling"). */
  status: string;
  /** Tổng entries sẽ được settle bởi worker. */
  totalEntries: number;
  /** Tổng số dòng (lines) cần xử lý — mỗi entry có thể expand ra nhiều dòng. */
  totalLines: number;
}

// ─────────────────────────────────────────────
// ListDraws
// ─────────────────────────────────────────────

export interface ListDrawsInput {
  /** Lọc theo trạng thái kỳ quay (tuỳ chọn). */
  status?: DrawStatus;
  /** Ngày bắt đầu lọc (ISO date, inclusive). */
  fromDate?: string;
  /** Ngày kết thúc lọc (ISO date, inclusive). */
  toDate?: string;
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số lượng bản ghi mỗi trang (mặc định 20). */
  size?: number;
}

export interface DrawSummary {
  /** MongoDB document ID. */
  id: string;
  /** ID kỳ quay (business key). */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: DrawNo;
  /** Giờ quay thưởng. */
  drawTime: string;
  /** Trạng thái hiện tại của kỳ quay. */
  status: string;
  /** Giá trị jackpot đầu kỳ (VND). */
  jackpotAmount?: number;
  /** Giá trị jackpot cuối kỳ sau khi settle (VND). */
  jackpotClosingAmount?: number;
  /** Kỳ quay đã có kết quả hay chưa. */
  hasResult: boolean;
  /** Kết quả quay thưởng (nếu có). */
  result?: {
    /** 6 số chính trúng thưởng ("01"-"45"), draw order. */
    winningNumbers: string[];
  };
  /** Kỳ này có phải kỳ split cycle không. */
  isSplitCycle?: boolean;
  /** Tổng số entry (lượt tham gia) trong kỳ. */
  ticketEntryCount?: number;
  /** Tổng doanh thu kỳ quay (VND). */
  totalRevenue?: number;
  /** Thông tin tài chính tổng hợp sau settle. */
  financial?: {
    /** Tổng giải thưởng cố định đã trả (tier2 + tier3 + tier4) — VND. */
    totalFixedPrizes: number;
    /** Tổng hoa hồng đại lý (VND). */
    totalAgentCommission: number;
    /** Phần công ty được hưởng (VND). */
    companyTake: number;
    /** Đóng góp vào quỹ jackpot trong kỳ (VND). */
    jackpotContribution: number;
  };
}

export interface ListDrawsOutput {
  /** Danh sách tóm tắt các kỳ quay. */
  draws: DrawSummary[];
  /** Trang hiện tại. */
  page: number;
  /** Số bản ghi mỗi trang. */
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
  /** Thông tin chi tiết kỳ quay (full entity từ DB). */
  draw: DrawEntity;
}
