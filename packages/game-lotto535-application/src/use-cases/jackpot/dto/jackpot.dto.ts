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

/**
 * Lịch sử Jackpot theo 1 kỳ quay đã settle.
 * Dùng cho bảng "Lịch sử Jackpot" lọc theo Vòng Jackpot (cycle).
 */
export interface JackpotHistoryItem {
  /** Mã kỳ quay. Format: YYYY-MM-DD.NNN */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = kỳ 13h, 2 = kỳ 21h). */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /** Số tiền Jackpot đầu kỳ (VND). Snapshot từ `draw.jackpot.openingAmount`. */
  openingAmount: number;
  /** Đóng góp vào quỹ Jackpot trong kỳ này (VND). Từ `draw.financial.jackpotContribution`. */
  contribution: number;
  /** Số tiền Jackpot cuối kỳ (VND). Snapshot từ `draw.jackpot.closingAmount`. */
  closingAmount: number;
  /** Có người trúng Jackpot trong kỳ này hay không. */
  hasWinner: boolean;
  /** Kỳ này là kỳ chia giải hay không. */
  isSplitCycle: boolean;
  /** Tổng entries tham gia kỳ quay. Từ `draw.stats.ticketEntryCount`. */
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
  /** Danh sách lịch sử Jackpot theo kỳ quay. */
  draws: JackpotHistoryItem[];
  /** Trang hiện tại (1-based). */
  page: number;
  /** Số lượng mỗi trang. */
  size: number;
}

// ─────────────────────────────────────────────
// ListJackpotHistoryByCycle (theo cycleNo)
// ─────────────────────────────────────────────

/**
 * Input lọc lịch sử Jackpot theo 1 Vòng Jackpot (cycle) cụ thể.
 * cycleNo = null → lấy draws của cycle đang active.
 */
export interface ListJackpotHistoryByCycleInput {
  /** Số thứ tự vòng Jackpot (cycleNo). null = vòng hiện tại. */
  cycleNo: number | null;
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số lượng mỗi trang (mặc định 20). */
  size?: number;
}

export interface ListJackpotHistoryByCycleOutput {
  /** Danh sách kỳ quay trong vòng Jackpot đã chọn, mới nhất trước. */
  draws: JackpotHistoryItem[];
  /** Trang hiện tại (1-based). */
  page: number;
  /** Số lượng mỗi trang. */
  size: number;
  /** Tổng số kỳ trong vòng này. */
  total: number;
}

// ─────────────────────────────────────────────
// ListAllJackpotCycleOptions (selector)
// ─────────────────────────────────────────────

/**
 * Tóm tắt 1 vòng Jackpot — dùng cho cycle selector dropdown.
 */
export interface JackpotCycleOption {
  /** Số thứ tự vòng (cycleNo). */
  cycleNo: number;
  /** Trạng thái vòng (active / closed). */
  status: string;
  /** Lý do đóng vòng (winner / split / manual_reset, nếu đã đóng). */
  closeReason?: string;
  /** Số tiền Jackpot khi kết thúc vòng (VND). */
  currentAmount: number;
  /** Số kỳ quay trong vòng. */
  drawCount: number;
  /** Thời điểm bắt đầu vòng (ISO 8601). */
  startedAt: string;
  /** Thời điểm kết thúc vòng (ISO 8601, nếu đã đóng). */
  closedAt?: string;
}

export interface ListAllJackpotCycleOptionsOutput {
  /** Tất cả vòng Jackpot từ mới nhất đến cũ nhất (active trước). */
  cycles: JackpotCycleOption[];
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
    tierAllocations: Record<string, { winnerCount: number; bonusPerWinner: number; totalAmount: number }>;
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
