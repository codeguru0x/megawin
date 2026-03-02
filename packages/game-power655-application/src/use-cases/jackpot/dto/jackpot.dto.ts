/**
 * Power 6/55 – Jackpot DTOs
 *
 * Tách riêng DTO cho các use case jackpot.
 * Hỗ trợ dual jackpot: JP1 (trùng 6/6) + JP2 (trùng 5/6 + bonus).
 */

import type { JackpotCycleClosedReason } from "@megawin/game-power655/entities";

// ─── GetJackpotCurrent ───

export interface GetJackpotCurrentOutput {
  /** Thông tin jackpot cycle đang hoạt động. */
  cycle: {
    /** Số thứ tự cycle (tăng dần khi cycle mới được tạo). */
    cycleNo: number;
    /** Trạng thái cycle ("active" hoặc "closed"). */
    status: string;
    /** Số dư Jackpot 1 hiện tại (VND). */
    jackpot1Current: number;
    /** Số dư Jackpot 2 hiện tại (VND). */
    jackpot2Current: number;
    /** Số dư Jackpot 1 khi bắt đầu cycle (VND). */
    jackpot1Opening: number;
    /** Số dư Jackpot 2 khi bắt đầu cycle (VND). */
    jackpot2Opening: number;
    /** Số kỳ quay đã settle trong cycle này. */
    drawCount: number;
    /** ID kỳ quay đầu tiên của cycle. */
    startDrawId: string;
    /** Thời điểm bắt đầu cycle (ISO 8601). */
    startedAt: string;
  };
  /** Cấu hình chia giải (split) hiện tại. */
  config: {
    /** Ngưỡng tổng JP (JP1 + JP2) để kích hoạt chia giải (VND). */
    splitThreshold: number;
    /** Tỷ lệ chia giải theo tier khi split. */
    splitRatios: {
      /** Tỷ lệ chia cho tier1 (trùng 5/6, không bonus). */
      tier1: number;
      /** Tỷ lệ chia cho tier2 (trùng 4/6). */
      tier2: number;
      /** Tỷ lệ chia cho tier3 (trùng 3/6). */
      tier3: number;
    };
  };
  /** Tiến trình tích lũy Jackpot 1. */
  jackpot1Progress: {
    /** Số dư JP1 hiện tại (VND). */
    current: number;
    /** Giá trị seed ban đầu của JP1 (VND). */
    seed: number;
  };
  /** Tiến trình tích lũy Jackpot 2. */
  jackpot2Progress: {
    /** Số dư JP2 hiện tại (VND). */
    current: number;
    /** Giá trị seed ban đầu của JP2 (VND). */
    seed: number;
  };
  /** Tiến trình tổng jackpot (JP1 + JP2) so với ngưỡng split. */
  totalJackpotProgress: {
    /** Tổng jackpot hiện tại = JP1 + JP2 (VND). */
    current: number;
    /** Ngưỡng splitThreshold (VND). */
    threshold: number;
    /** Phần trăm tiến trình = (current / threshold) × 100. */
    percentage: number;
    /** Số tiền còn thiếu để đạt ngưỡng split (VND). */
    remaining: number;
  };
  /** Kỳ quay tiếp theo (nếu có). */
  nextDraw?: {
    /** ID kỳ quay tiếp theo. */
    drawId: string;
    /** Số thứ tự kỳ quay. */
    drawNo: number;
    /** Giờ quay, định dạng HH:mm. */
    drawTime: string;
    /** Kỳ tiếp theo có dự kiến chia giải (split) hay không. */
    splitCycleIntent: boolean;
  };
}

// ─── ListJackpotHistory (draw-by-draw) ───

export interface ListJackpotHistoryInput {
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số lượng mỗi trang (mặc định 20). */
  size?: number;
}

export interface JackpotHistoryItem {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Giờ quay, định dạng HH:mm. */
  drawTime: string;
  /** Số dư Jackpot 1 đầu kỳ (VND). */
  openingJackpot1: number;
  /** Số dư Jackpot 2 đầu kỳ (VND). */
  openingJackpot2: number;
  /** Số dư Jackpot 1 cuối kỳ (VND). */
  closingJackpot1: number;
  /** Số dư Jackpot 2 cuối kỳ (VND). */
  closingJackpot2: number;
  /**
   * Đóng góp vào JP1 kỳ này (VND).
   * Công thức: totalRevenue × jp1Ratio.
   */
  jackpot1Contribution: number;
  /**
   * Đóng góp vào JP2 kỳ này (VND).
   * Công thức: totalRevenue × jp2Ratio + jp1Overflow.
   */
  jackpot2Contribution: number;
  /** Có người trúng Jackpot 1 (6/6) trong kỳ này hay không. */
  hasJackpot1Winner: boolean;
  /** Có người trúng Jackpot 2 (5/6 + bonus) trong kỳ này hay không. */
  hasJackpot2Winner: boolean;
  /** Kỳ này có phải là kỳ chia giải (tổng JP vượt splitThreshold). */
  isSplitCycle: boolean;
  /** Tổng số entries tham gia kỳ quay. */
  totalEntries: number;
  /** Tổng doanh thu kỳ quay (VND). */
  totalRevenue: number;
}

export interface ListJackpotHistoryOutput {
  /** Danh sách lịch sử jackpot theo kỳ quay. */
  draws: JackpotHistoryItem[];
  /** Trang hiện tại. */
  page: number;
  /** Số lượng mỗi trang. */
  size: number;
}

// ─── ListJackpotCycles ───

export interface ListJackpotCyclesInput {
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số lượng mỗi trang (mặc định 20). */
  size?: number;
}

export interface JackpotWinnerSummary {
  /** ID tài khoản người chơi trúng jackpot. */
  accountId: string;
  /** Tên đăng nhập (có thể ẩn danh). */
  username?: string;
  /** ID tenant (đại lý) của người chơi. */
  tenantId: string;
  /** Tên tenant (đại lý). */
  tenantName?: string;
  /** Số tiền jackpot nhận được (VND). */
  prizeAmount: number;
  /** ID entry trúng jackpot. */
  entryId: string;
  /** ID kỳ quay trúng jackpot. */
  drawId: string;
  /** Loại jackpot trúng: "jackpot1" (6/6) hoặc "jackpot2" (5/6 + bonus). */
  jackpotType: string;
}

export interface JackpotCycleSummary {
  /** ID cycle (MongoDB _id). */
  id: string;
  /** Số thứ tự cycle. */
  cycleNo: number;
  /** Trạng thái cycle ("active" hoặc "closed"). */
  status: string;
  /** ID kỳ quay đầu tiên của cycle. */
  startDrawId: string;
  /** Thời điểm bắt đầu cycle (ISO 8601). */
  startedAt: string;
  /** ID kỳ quay cuối cùng của cycle (khi đóng). */
  endDrawId?: string;
  /** Thời điểm đóng cycle (ISO 8601). */
  closedAt?: string;
  /** Lý do đóng cycle: jackpot1_winner / jackpot2_winner / both_winner / split. */
  closedReason?: JackpotCycleClosedReason;
  /** Số dư Jackpot 1 khi bắt đầu cycle (VND). */
  jackpot1Opening: number;
  /** Số dư Jackpot 1 hiện tại hoặc cuối cycle (VND). */
  jackpot1Current: number;
  /** Số dư Jackpot 2 khi bắt đầu cycle (VND). */
  jackpot2Opening: number;
  /** Số dư Jackpot 2 hiện tại hoặc cuối cycle (VND). */
  jackpot2Current: number;
  /** Số kỳ quay đã settle trong cycle. */
  drawCount: number;
  /** Chi tiết chia giải (chỉ có khi cycle đóng do split). */
  splitDetail?: {
    /** Tổng số tiền jackpot được chia (JP1 + JP2) (VND). */
    splitAmount: number;
    /** Tổng số người thắng nhận thưởng split. */
    totalWinners: number;
    /** Tổng số tiền đã trả cho split (VND). */
    totalPaid: number;
    /** Chi tiết phân bổ theo tier giải. */
    tierAllocations: Record<
      string,
      {
        /** Số người thắng tier này. */
        winnerCount: number;
        /** Số tiền bonus mỗi người thắng (VND). */
        bonusPerWinner: number;
        /** Tổng tiền phân bổ cho tier = bonusPerWinner × winnerCount (VND). */
        totalAmount: number;
      }
    >;
  };
  /** Danh sách người trúng jackpot trong cycle (nếu có). */
  winners?: JackpotWinnerSummary[];
}

export interface ListJackpotCyclesOutput {
  /** Danh sách các jackpot cycles. */
  cycles: JackpotCycleSummary[];
  /** Trang hiện tại. */
  page: number;
  /** Số lượng mỗi trang. */
  size: number;
  /** Tổng số cycles. */
  total: number;
}
