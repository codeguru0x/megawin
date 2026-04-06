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
    jackpot1CurrentAmount: number;
    /** Số dư Jackpot 2 hiện tại (VND). */
    jackpot2CurrentAmount: number;
    /** Giá trị seed JP1 khi bắt đầu cycle (VND). */
    jackpot1SeedAmount: number;
    /** Giá trị seed JP2 khi bắt đầu cycle (VND). */
    jackpot2SeedAmount: number;
    /** Số kỳ quay đã settle trong cycle này. */
    drawCount: number;
    /** ID kỳ quay đầu tiên của cycle. */
    startDrawId: string;
    /** Thời điểm bắt đầu cycle (ISO 8601). */
    startedAt: string;
    /**
     * Số lần Jackpot 2 đã trao thưởng và reset về seed trong cycle này.
     * JP2 có thể reset nhiều lần trong 1 cycle vì JP2 winner KHÔNG đóng cycle.
     * = 0 khi cycle mới tạo, tăng mỗi lần JP2 có winner.
     */
    jackpot2ResetCount: number;
  };
  /** Cấu hình jackpot: overflow threshold. */
  config: {
    /** Ngưỡng tràn JP1 (VND) — phần vượt chuyển sang JP2. */
    jp1OverflowThreshold: number;
    /** Tỷ lệ phân bổ theo tier khi split (nếu có). */
    splitRatios?: Record<string, number>;
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
  /** Tiến trình tích lũy tổng hợp JP1 + JP2. */
  totalJackpotProgress?: {
    /** Tổng JP1 + JP2 hiện tại (VND). */
    current: number;
    /** Ngưỡng tổng (VND). */
    threshold: number;
    /** Phần còn thiếu để đạt ngưỡng (VND). */
    remaining: number;
    /** Phần trăm tiến trình (0–100+). */
    percentage: number;
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
  /** ID kỳ quay. Format: YYYY-MM-DD.NNN */
  drawId: string;
  /** Ngày quay, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /** Số dư Jackpot 1 đầu kỳ (VND). Snapshot từ `draw.jackpot.openingJackpot1`. */
  openingJackpot1: number;
  /** Số dư Jackpot 2 đầu kỳ (VND). Snapshot từ `draw.jackpot.openingJackpot2`. */
  openingJackpot2: number;
  /** Số dư Jackpot 1 cuối kỳ (VND). Snapshot từ `draw.jackpot.closingJackpot1`. */
  closingJackpot1: number;
  /** Số dư Jackpot 2 cuối kỳ (VND). Snapshot từ `draw.jackpot.closingJackpot2`. */
  closingJackpot2: number;
  /**
   * Đóng góp vào JP1 kỳ này (VND). Từ `draw.financial.jackpot1Contribution`.
   * Đã trừ jp1Overflow nếu overflow kích hoạt.
   */
  jackpot1Contribution: number;
  /**
   * Đóng góp vào JP2 kỳ này (VND). Từ `draw.financial.jackpot2Contribution`.
   * Bao gồm jp1Overflow nếu overflow kích hoạt VÀ có JP2 winner kỳ đó.
   */
  jackpot2Contribution: number;
  /**
   * Phần JP1 tràn chuyển sang JP2 kỳ này (VND). Từ `draw.financial.jp1Overflow`.
   * = 0 nếu không overflow hoặc không có JP2 winner.
   */
  jp1Overflow: number;
  /** Có người trúng Jackpot 1 (6/6) trong kỳ này hay không. */
  hasJackpot1Winner: boolean;
  /** Có người trúng Jackpot 2 (5/6 + bonus) trong kỳ này hay không. */
  hasJackpot2Winner: boolean;
  /** Tổng số entries tham gia kỳ quay. Từ `draw.stats.ticketEntryCount`. */
  totalEntries: number;
  /** Tổng doanh thu bán vé kỳ quay (VND). Từ `draw.financial.totalRevenue`. */
  totalRevenue: number;
  /** Tổng tiền trả giải cố định (tier1–tier3, VND). Từ `draw.financial.totalFixedPrizes`. */
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
  /** Tên đăng nhập người chơi. */
  username: string;
  /** ID tenant (đại lý) của người chơi. */
  tenantId: string;
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
  /** Lý do đóng cycle: jackpot1_winner / jackpot2_winner / both_winner / manual_reset. */
  closedReason?: JackpotCycleClosedReason;
  /** Giá trị seed Jackpot 1 khi bắt đầu cycle (VND). */
  jackpot1SeedAmount: number;
  /** Số dư Jackpot 1 hiện tại hoặc cuối cycle (VND). */
  jackpot1CurrentAmount: number;
  /** Giá trị seed Jackpot 2 khi bắt đầu cycle (VND). */
  jackpot2SeedAmount: number;
  /** Số dư Jackpot 2 hiện tại hoặc cuối cycle (VND). */
  jackpot2CurrentAmount: number;
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

// ─── ListJackpotHistoryByCycle ───

export interface ListJackpotHistoryByCycleInput {
  /** Số thứ tự cycle cần xem lịch sử (1-based). */
  cycleNo: number;
  /** Trang hiện tại (1-based, mặc định 1). */
  page?: number;
  /** Số lượng mỗi trang (mặc định 20). */
  size?: number;
}

export interface ListJackpotHistoryByCycleOutput {
  /** Danh sách draws trong cycle, mới nhất trên cùng. */
  draws: JackpotHistoryItem[];
  /** Trang hiện tại. */
  page: number;
  /** Số lượng mỗi trang. */
  size: number;
  /** Tổng số draws trong cycle. */
  total: number;
}

// ─── ListAllJackpotCycleOptions ───

export interface JackpotCycleOption {
  /** Số thứ tự cycle. */
  cycleNo: number;
  /** Trạng thái cycle ("active" hoặc "closed"). */
  status: string;
  /** ID kỳ quay đầu tiên của cycle. */
  startDrawId: string;
  /** Lý do đóng cycle: jackpot1_winner / both_winner / manual_reset (chỉ khi closed). */
  closedReason?: string;
}

export interface ListAllJackpotCycleOptionsOutput {
  /** Danh sách cycle options cho selector, mới nhất trước. Tối đa 10 vòng. */
  cycles: JackpotCycleOption[];
  /** cycleNo của vòng active hiện tại (để pre-select). */
  activeCycleNo: number | null;
}
