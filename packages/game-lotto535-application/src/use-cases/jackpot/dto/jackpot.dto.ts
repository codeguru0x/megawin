/**
 * Lotto 5/35 – Jackpot DTOs
 *
 * Tách riêng DTO cho các use case jackpot.
 * Dùng cho cả API response và client-side type.
 */

import type { JackpotCycleStatus, JackpotCycleCloseReason } from "@megawin/game-lotto535/entities";

// ─────────────────────────────────────────────
// GetJackpotCurrent
// ─────────────────────────────────────────────

export interface GetJackpotCurrentOutput {
  /** Thông tin cycle Jackpot đang active. */
  cycle: {
    /** Số thứ tự cycle (tự tăng). */
    cycleNo: number;
    /** Trạng thái cycle (active, closed). */
    status: JackpotCycleStatus;
    /** Số tiền khởi điểm khi bắt đầu cycle (VND). */
    seedAmount: number;
    /** Số tiền Jackpot hiện tại (VND) = seedAmount + totalContribution. */
    currentAmount: number;
    /** Số tiền Jackpot cao nhất từng đạt trong cycle (VND). */
    peakAmount: number;
    /** Tổng đóng góp vào quỹ Jackpot qua tất cả kỳ (VND). */
    totalContribution: number;
    /** Số kỳ đã settle trong cycle này. */
    drawCount: number;
    /** Mã kỳ quay bắt đầu cycle. */
    startDrawId: string;
    /** Thời điểm bắt đầu cycle (ISO 8601). */
    startedAt: string;
    /** Mã kỳ settle gần nhất trong cycle (nếu có). */
    lastSettledDrawId?: string;
  };
  /** Cấu hình chia Jackpot hiện tại. */
  config: {
    /** Ngưỡng kích hoạt chia Jackpot (VND). */
    splitThreshold: number;
    /** Tỷ lệ chia cho từng tier khi split (tổng = 1.0). */
    splitRatios: {
      /** Tỷ lệ chia cho giải Nhất. */
      tier1: number;
      /** Tỷ lệ chia cho giải Nhì. */
      tier2: number;
      /** Tỷ lệ chia cho giải Ba. */
      tier3: number;
      /** Tỷ lệ chia cho giải Tư. */
      tier4: number;
      /** Tỷ lệ chia cho giải Năm. */
      tier5: number;
    };
  };
  /** Tiến trình tích luỹ hướng tới ngưỡng chia. */
  progress: {
    /** Số tiền hiện tại (VND). */
    current: number;
    /** Ngưỡng chia (VND). */
    threshold: number;
    /** Phần trăm (0-100) = (current / threshold) × 100. */
    percentage: number;
    /** Số tiền còn thiếu để đạt ngưỡng (VND) = threshold − current. */
    remaining: number;
  };
}

// ─────────────────────────────────────────────
// ListJackpotHistory (draw-by-draw)
// ─────────────────────────────────────────────

export interface ListJackpotHistoryInput {
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số lượng mỗi trang (mặc định 20). */
  size?: number;
}

export interface JackpotHistoryItem {
  /** Mã kỳ quay. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Giờ quay (HH:mm). */
  drawTime: string;
  /** Số tiền Jackpot đầu kỳ (VND). */
  openingAmount: number;
  /** Đóng góp vào quỹ Jackpot trong kỳ này (VND). */
  contribution: number;
  /** Số tiền Jackpot cuối kỳ (VND) = openingAmount + contribution (hoặc seed nếu có winner/split). */
  closingAmount: number;
  /** Có người trúng Jackpot trong kỳ này hay không. */
  hasWinner: boolean;
  /** Kỳ này có chia Jackpot hay không. */
  isSplitCycle: boolean;
  /** Tổng entries tham gia kỳ quay. */
  ticketEntryCount: number;
  /** Tổng doanh thu kỳ quay (VND). */
  totalRevenue: number;
}

export interface ListJackpotHistoryOutput {
  /** Danh sách lịch sử Jackpot theo kỳ quay. */
  draws: JackpotHistoryItem[];
  /** Trang hiện tại (1-based). */
  page: number;
  /** Số lượng mỗi trang. */
  size: number;
}

// ─────────────────────────────────────────────
// ListJackpotCycles (chia / trúng)
// ─────────────────────────────────────────────

export interface ListJackpotCyclesInput {
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số lượng mỗi trang (mặc định 20). */
  size?: number;
}

export interface JackpotWinnerSummary {
  /** Mã tài khoản người trúng. */
  accountId: string;
  /** Tên đăng nhập (nếu có). */
  username?: string;
  /** Mã tenant của người trúng. */
  tenantId: string;
  /** Tên tenant (nếu có). */
  tenantName?: string;
  /** Số tiền Jackpot được nhận (VND). */
  prizeAmount: number;
  /** Mã entry trúng Jackpot. */
  entryId: string;
  /** Mã kỳ quay trúng Jackpot. */
  drawId: string;
}

export interface JackpotCycleSummary {
  /** MongoDB document ID. */
  id: string;
  /** Số thứ tự cycle (tự tăng). */
  cycleNo: number;
  /** Trạng thái cycle (active, closed). */
  status: JackpotCycleStatus;
  /** Mã kỳ quay bắt đầu cycle. */
  startDrawId: string;
  /** Thời điểm bắt đầu cycle (ISO 8601). */
  startedAt: string;
  /** Mã kỳ quay kết thúc cycle (nếu đã đóng). */
  endDrawId?: string;
  /** Thời điểm đóng cycle (ISO 8601, nếu đã đóng). */
  closedAt?: string;
  /** Lý do đóng cycle (winner = có người trúng, split = chia giải). */
  closeReason?: JackpotCycleCloseReason;
  /** Số tiền khởi điểm cycle (VND). */
  seedAmount: number;
  /** Số tiền hiện tại / cuối cùng (VND). */
  currentAmount: number;
  /** Số tiền cao nhất trong cycle (VND). */
  peakAmount: number;
  /** Tổng đóng góp qua tất cả kỳ (VND). */
  totalContribution: number;
  /** Số kỳ đã settle trong cycle. */
  drawCount: number;
  /** Chi tiết chia Jackpot — chỉ có khi closeReason = "split". */
  splitDetail?: {
    /** Tổng tiền chia (VND) = currentAmount tại thời điểm chia. */
    splitAmount: number;
    /** Tổng số người nhận chia. */
    totalWinners: number;
    /** Tổng tiền đã chi trả (VND). */
    totalPaid: number;
    /**
     * Phân bổ theo tier.
     * Key: tên tier (tier1, tier2, ...).
     * Value: { winnerCount, bonusPerWinner, totalAmount }.
     */
    tierAllocations: Record<
      string,
      { winnerCount: number; bonusPerWinner: number; totalAmount: number }
    >;
  };
  /** Danh sách người trúng Jackpot — chỉ có khi closeReason = "winner". */
  winners?: JackpotWinnerSummary[];
}

export interface ListJackpotCyclesOutput {
  /** Danh sách cycles. */
  cycles: JackpotCycleSummary[];
  /** Trang hiện tại (1-based). */
  page: number;
  /** Số lượng mỗi trang. */
  size: number;
  /** Tổng số cycles. */
  total: number;
}
