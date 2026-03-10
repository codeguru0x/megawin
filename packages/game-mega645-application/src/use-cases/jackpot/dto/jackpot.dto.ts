import type { JackpotCycleStatus, JackpotCycleCloseReason } from "@megawin/game-mega645/entities";

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
  /** Cấu hình jackpot: ngưỡng split và tỷ lệ phân bổ theo tier. */
  config?: {
    /** Ngưỡng giá trị jackpot để kích hoạt split cycle (VND). */
    splitThreshold?: number;
    /** Tỷ lệ phân bổ jackpot theo từng tier khi split (tier → tỷ lệ %). */
    splitRatios?: Record<string, number>;
  };
  /** Tiến trình tích lũy jackpot đến ngưỡng split. */
  progress?: {
    /** Giá trị jackpot hiện tại (VND). */
    current: number;
    /** Ngưỡng split (VND). */
    threshold: number;
    /** Phần còn thiếu để đạt ngưỡng (VND). */
    remaining: number;
    /** Phần trăm tiến trình (0–100+). */
    percentage: number;
  };
  /** Kỳ quay tiếp theo (nếu có). */
  nextDraw?: {
    /** ID kỳ quay tiếp theo. */
    drawId: string;
    /** Giờ quay thưởng. */
    drawTime: string;
    /** Có ý định split jackpot trong kỳ này không. */
    splitCycleIntent?: boolean;
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
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Giờ quay thưởng. */
  drawTime: string;
  /** Giá trị jackpot đầu kỳ (VND). */
  openingAmount: number;
  /** Đóng góp vào jackpot trong kỳ (VND). */
  contribution: number;
  /**
   * Giá trị quỹ jackpot cuối kỳ (VND).
   * LUÔN = openingAmount + contribution (snapshot thực tế quỹ JP).
   */
  closingAmount: number;
  /** Có người trúng jackpot (6/6) trong kỳ không. */
  hasWinner: boolean;
  /** Kỳ này có phải kỳ split cycle không. */
  isSplitCycle?: boolean;
  /** Tổng số entry (lượt tham gia) trong kỳ. */
  ticketEntryCount: number;
  /** Tổng doanh thu kỳ quay (VND). */
  totalRevenue: number;
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
  /** Chi tiết chia giải khi split cycle (nếu có). */
  splitDetail?: {
    /** Tổng số tiền được chia (VND). */
    splitAmount: number;
    /** Tổng tiền đã thanh toán (VND). */
    totalPaid: number;
    /** Tổng số người thắng. */
    totalWinners: number;
    /** Phân bổ theo tier. */
    tierAllocations: Record<
      string,
      {
        /** Số người thắng tier này. */
        winnerCount: number;
        /** Tổng tiền phân bổ cho tier (VND). */
        totalAmount: number;
        /** Tiền bonus mỗi người thắng (VND). */
        bonusPerWinner: number;
      }
    >;
  };
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
