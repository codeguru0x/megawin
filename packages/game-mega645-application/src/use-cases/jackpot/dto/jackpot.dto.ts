import type { JackpotCycleCloseReason, JackpotCycleStatus } from "@megawin/game-mega645/entities";

// ─────────────────────────────────────────────
// GetJackpotCurrent
// ─────────────────────────────────────────────

export interface GetJackpotCurrentOutput {
  /** Thông tin cycle jackpot đang active. */
  cycle: {
    /** Số thứ tự cycle (tăng dần khi tạo cycle mới). */
    cycleNo: number;
    /** Trạng thái cycle: "active" | "closed". */
    status: JackpotCycleStatus;
    /** Giá trị khởi tạo khi bắt đầu cycle (VND). */
    seedAmount: number;
    /** Giá trị jackpot hiện tại (VND) = seedAmount + tổng contribution các kỳ. */
    currentAmount: number;
    /** Giá trị jackpot cao nhất đạt được trong cycle (VND). */
    peakAmount: number;
    /** Tổng đóng góp từ tất cả các kỳ trong cycle (VND). */
    totalContribution: number;
    /** Số kỳ quay đã settle trong cycle. */
    drawCount: number;
    /** ID kỳ quay đầu tiên của cycle. */
    startDrawId: string;
    /** Thời điểm bắt đầu cycle (ISO datetime). */
    startedAt: string;
    /** ID kỳ quay settle gần nhất trong cycle (nếu có). */
    lastSettledDrawId?: string;
  };
  /**
   * Tiến trình tích lũy jackpot đến ngưỡng milestone giả định.
   *
   * Mega 6/45 không có giới hạn trần — dùng ngưỡng milestone giả định
   * tính từ seedAmount để hiển thị tiến trình có ý nghĩa cho staff.
   * Ngưỡng tăng dần mỗi khi vượt qua: x10 seed → x15 → x20 → ...
   */
  progress: {
    /** Giá trị jackpot hiện tại (VND). */
    current: number;
    /** Ngưỡng milestone giả định (VND). */
    milestoneThreshold: number;
    /** Phần còn thiếu để đạt ngưỡng (VND). Bằng 0 nếu đã vượt ngưỡng. */
    remaining: number;
    /** Phần trăm tiến trình (0–100+, có thể > 100 khi vượt ngưỡng). */
    percentage: number;
    /** Bội số hiện tại so với seed (ví dụ 10 = x10 seed). */
    currentMultiple: number;
    /** Bội số mốc tiếp theo (ví dụ 15 sau x10). */
    nextMultiple: number;
  };
}

// ─────────────────────────────────────────────
// ListJackpotHistory (draw-by-draw)
// ─────────────────────────────────────────────

export interface ListJackpotHistoryInput {
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số bản ghi mỗi trang (mặc định 20). */
  size?: number;
}

export interface JackpotHistoryItem {
  /** ID kỳ quay. Format: YYYY-MM-DD.NNN */
  drawId: string;
  /** Ngày quay thưởng (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Giờ quay thưởng (ISO 8601). */
  drawTime: string;
  /** Giá trị jackpot đầu kỳ (VND). Snapshot từ `draw.jackpot.openingAmount`. */
  openingAmount: number;
  /** Đóng góp vào quỹ jackpot trong kỳ (VND). Từ `draw.financial.jackpotContribution`. */
  contribution: number;
  /**
   * Giá trị quỹ jackpot cuối kỳ (VND).
   * Snapshot từ `draw.jackpot.closingAmount`.
   */
  closingAmount: number;
  /** Có người trúng jackpot (6/6) trong kỳ không. */
  hasWinner: boolean;
  /** Tổng số entry (lượt tham gia) trong kỳ. */
  ticketEntryCount: number;
  /** Tổng doanh thu bán vé kỳ quay (VND). Từ `draw.financial.totalRevenue`. */
  totalRevenue: number;
  /** Tổng tiền trả giải cố định (tier1 → consolation, VND). Từ `draw.financial.totalFixedPrizes`. */
  totalFixedPrizes: number;
  /** Công ty thu về (sau cap, VND). Từ `draw.financial.actualCompanyTake`. */
  actualCompanyTake: number;
  /** Tỷ lệ công ty thu theo cấu hình (0–1). Từ `draw.financial.companyTakeRate`. */
  companyTakeRate: number;
}

export interface ListJackpotHistoryOutput {
  /** Danh sách lịch sử jackpot theo kỳ quay. */
  draws: JackpotHistoryItem[];
  /** Trang hiện tại. */
  page: number;
  /** Số bản ghi mỗi trang. */
  size: number;
}

// ─────────────────────────────────────────────
// ListJackpotCycles
// ─────────────────────────────────────────────

export interface ListJackpotCyclesInput {
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số bản ghi mỗi trang (mặc định 20). */
  size?: number;
}

export interface JackpotWinnerSummary {
  /** ID tài khoản người trúng. */
  accountId: string;
  /** Tên đăng nhập (có thể ẩn một phần). */
  username: string;
  /** ID tenant của người trúng. */
  tenantId: string;
  /** Tên tenant (đại lý) của người trúng. */
  tenantName?: string;
  /** Số tiền thưởng jackpot (VND). */
  prizeAmount: number;
  /** ID entry trúng jackpot. */
  entryId: string;
  /** ID kỳ quay trúng jackpot. */
  drawId: string;
}

export interface JackpotCycleSummary {
  /** MongoDB document ID. */
  id: string;
  /** Số thứ tự cycle. */
  cycleNo: number;
  /** Trạng thái cycle: "active" | "closed". */
  status: JackpotCycleStatus;
  /** ID kỳ quay đầu tiên của cycle. */
  startDrawId: string;
  /** Thời điểm bắt đầu cycle (ISO datetime). */
  startedAt: string;
  /** ID kỳ quay cuối cùng (kỳ đóng cycle). */
  endDrawId?: string;
  /** Thời điểm đóng cycle (ISO datetime). */
  closedAt?: string;
  /** Lý do đóng cycle: "winner" | "manual_reset". */
  closeReason?: JackpotCycleCloseReason | string;
  /** Giá trị khởi tạo cycle (VND). */
  seedAmount: number;
  /** Giá trị jackpot hiện tại/cuối cùng (VND). */
  currentAmount: number;
  /** Giá trị jackpot cao nhất trong cycle (VND). */
  peakAmount: number;
  /** Tổng đóng góp từ tất cả các kỳ (VND). */
  totalContribution: number;
  /** Số kỳ quay đã settle trong cycle. */
  drawCount: number;
  /** Danh sách người trúng jackpot (chỉ có khi closeReason = "winner"). */
  winners?: JackpotWinnerSummary[];
}

export interface ListJackpotCyclesOutput {
  /** Danh sách cycle jackpot. */
  cycles: JackpotCycleSummary[];
  /** Trang hiện tại. */
  page: number;
  /** Số bản ghi mỗi trang. */
  size: number;
  /** Tổng số cycle. */
  total: number;
}

// ─────────────────────────────────────────────
// ListAllJackpotCycleOptions (cho selector UI)
// ─────────────────────────────────────────────

/**
 * Cycle option tối giản dùng cho selector dropdown trên Lịch sử Jackpot.
 * Mega 6/45 không có split — chỉ closeReason = "winner" | "manual_reset".
 */
export interface JackpotCycleOption {
  /** Số thứ tự cycle. */
  cycleNo: number;
  /** Trạng thái cycle: "active" | "closed". */
  status: JackpotCycleStatus;
  /** Lý do đóng cycle (chỉ có khi closed). */
  closeReason?: JackpotCycleCloseReason | string;
  /** Giá trị jackpot hiện tại/cuối kỳ (VND). */
  currentAmount: number;
  /** Số kỳ quay trong cycle. */
  drawCount: number;
  /** Thời điểm bắt đầu cycle (ISO 8601). */
  startedAt: string;
  /** Thời điểm đóng cycle (ISO 8601). Chỉ có khi closed. */
  closedAt?: string;
}

export interface ListAllJackpotCycleOptionsOutput {
  /** Danh sách cycle options (mới nhất trước, limit 10). */
  cycles: JackpotCycleOption[];
}

// ─────────────────────────────────────────────
// ListJackpotHistoryByCycle
// ─────────────────────────────────────────────

export interface ListJackpotHistoryByCycleInput {
  /**
   * Số thứ tự cycle muốn xem.
   * `null` = cycle đang active (current cycle).
   */
  cycleNo: number | null;
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số bản ghi mỗi trang (mặc định = Pagination.Default.Size). */
  size?: number;
}

export interface ListJackpotHistoryByCycleOutput {
  /** Danh sách lịch sử Jackpot trong cycle được chọn. */
  draws: JackpotHistoryItem[];
  /** Trang hiện tại (1-based). */
  page: number;
  /** Số bản ghi mỗi trang. */
  size: number;
  /** Tổng số draws trong cycle. */
  total: number;
}
