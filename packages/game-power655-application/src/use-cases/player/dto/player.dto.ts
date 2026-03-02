/**
 * Power 6/55 – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 *
 * Khác biệt so với Lotto 5/35:
 *   - Dual jackpot: jackpot1CurrentAmount + jackpot2CurrentAmount
 *   - Lines không có special number
 *   - matchResult có bonusMatched thay vì specialMatched
 */

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  /** Kỳ quay active đầu tiên (null nếu không có kỳ nào đang active). */
  currentDraw: PlayerDrawInfo | null;
  /** Tất cả các kỳ quay đang active, sorted theo drawDate tăng dần. */
  activeDraws: PlayerDrawInfo[];
  /** Jackpot 1 hiện tại (VND) — trùng 6/6 số chính. */
  jackpot1CurrentAmount: number;
  /** Jackpot 2 hiện tại (VND) — trùng 5/6 số chính + bonus number. */
  jackpot2CurrentAmount: number;
  /** Kết quả kỳ quay gần nhất đã công bố (null nếu chưa có). */
  lastResult: {
    /** ID kỳ quay. */
    drawId: string;
    /** Ngày quay, định dạng YYYY-MM-DD. */
    drawDate: string;
    /** Số thứ tự kỳ quay. */
    drawNo: number;
    /** 6 số chính trúng thưởng đã sắp xếp tăng dần. */
    winningMain: number[];
    /** Số bonus (1 số từ 49 số còn lại). */
    bonusNumber: number;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  } | null;
}

export interface PlayerDrawInfo {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Giờ quay, định dạng HH:mm (giờ VN). */
  drawTime: string;
  /** Trạng thái kỳ quay (scheduled / salesOpen / salesClosed / ...). */
  status: string;
  /** Thông tin thời gian mở/đóng bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO 8601). Undefined nếu chưa mở. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
  /** Jackpot 1 hiện tại (VND) — giải trùng 6/6. */
  jackpot1CurrentAmount: number;
  /** Jackpot 2 hiện tại (VND) — giải trùng 5/6 + bonus. */
  jackpot2CurrentAmount: number;
}

// ─── Get Jackpot (Player) ───

export interface PlayerGetJackpotOutput {
  /** Số tiền Jackpot 1 hiện tại (VND) — giải trùng 6/6 số chính. */
  jackpot1Amount: number;
  /** Số tiền Jackpot 2 hiện tại (VND) — giải trùng 5/6 + bonus. */
  jackpot2Amount: number;
  /** Giá trị khởi tạo JP1 khi bắt đầu cycle mới (VND). */
  jp1SeedAmount: number;
  /** Giá trị khởi tạo JP2 khi bắt đầu cycle mới (VND). */
  jp2SeedAmount: number;
  /** Tiến trình tích lũy jackpot tổng (JP1 + JP2). */
  progress: {
    /** Tổng jackpot hiện tại = jackpot1Amount + jackpot2Amount (VND). */
    totalCurrent: number;
    /** Ngưỡng kích hoạt chia giải (splitThreshold) (VND). */
    threshold: number;
    /** Phần trăm tiến trình = (totalCurrent / threshold) × 100. */
    percentage: number;
  };
  /** Kỳ quay tiếp theo (nếu có). */
  nextDraw?: {
    /** ID kỳ quay tiếp theo. */
    drawId: string;
    /** Giờ quay, định dạng HH:mm. */
    drawTime: string;
  };
}

// ─── List Tickets (Player) ───

/** Tiêu chí sắp xếp danh sách vé: theo ngày đặt cược hoặc ngày quay. */
export type TicketSortBy = "betDate" | "drawDate";

export const TICKET_SORT_BY_VALUES: readonly TicketSortBy[] = [
  "betDate",
  "drawDate",
];

export interface PlayerListPendingTicketsInput {
  /** ID tenant (đại lý) của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Cursor phân trang (lấy từ nextCursor của response trước). */
  cursor?: string;
}

export interface PlayerListCompletedTicketsInput {
  /** ID tenant (đại lý) của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Tiêu chí sắp xếp: theo ngày đặt cược hoặc ngày quay. */
  sortBy: TicketSortBy;
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD, inclusive). */
  to?: string;
  /** Cursor phân trang (lấy từ nextCursor của response trước). */
  cursor?: string;
}

export interface PlayerTicketSummary {
  /** ID vé (MongoDB _id). */
  id: string;
  /** Mã vé hiển thị (ví dụ: "PW-20250301-00123"). */
  ticketNo: string;
  /** Trạng thái vé (active / completed / voided). */
  status: string;
  /** Kế hoạch kỳ quay của vé. */
  drawPlan: {
    /** Danh sách ID các kỳ quay mà vé tham gia. */
    drawIds: string[];
    /** Tổng số kỳ quay vé tham gia. */
    drawCount: number;
  };
  /** Thông tin giá cược. */
  pricing: {
    /** Giá 1 dòng cược (VND). */
    unitPrice: number;
    /** Số dòng cược mỗi kỳ quay. */
    linesPerDraw: number;
    /**
     * Số tiền cược mỗi kỳ quay (VND).
     * Công thức: unitPrice × linesPerDraw.
     */
    stakePerDraw: number;
    /**
     * Tổng tiền cược toàn vé (VND).
     * Công thức: stakePerDraw × drawCount.
     */
    totalStake: number;
  };
  /** Danh sách boards trong vé. */
  boards: Array<{
    /** Mã board (A, B, C, ...). */
    boardNo: string;
    /** Loại chơi (Standard / Bao7-18 / QuickPick). */
    playType: string;
    /** Các số đã chọn trên board. */
    selection: {
      /** Danh sách số chính đã chọn (6-18 số trong range [1, 55]). */
      mainNumbers: number[];
    };
    /** Số dòng cược sinh ra từ board này. Standard=1, BaoN=C(N,6). */
    lineCount: number;
  }>;
  /** Tiến trình xử lý vé qua các kỳ quay. */
  progress: {
    /** Số kỳ quay đã settle (đã có kết quả và trả thưởng). */
    settledDrawCount: number;
    /** Số kỳ quay đã bị huỷ (void). */
    voidDrawCount: number;
  };
  /** Tổng kết thưởng (chỉ có khi đã có ít nhất 1 kỳ settle). */
  settlement?: {
    /** Tổng tiền thắng từ tất cả entries đã settle (VND). */
    totalWinAmount: number;
  };
  /** Thời điểm tạo vé (ISO 8601). */
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  /** Danh sách vé. */
  tickets: PlayerTicketSummary[];
  /** Cursor cho trang tiếp theo. Null nếu hết dữ liệu. */
  nextCursor: string | null;
  /** Số lượng mỗi trang. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** ID tenant (đại lý) của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** ID vé cần xem chi tiết entries. */
  ticketId: string;
}

export interface PlayerEntryInfo {
  /** ID entry (MongoDB _id). */
  id: string;
  /** ID kỳ quay mà entry thuộc về. */
  drawId: string;
  /** Ngày quay, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Giờ quay, định dạng HH:mm. */
  drawTime: string;
  /** Trạng thái entry (drawn / settled / voided). */
  status: string;
  /** Số tiền cược cho entry này (VND). */
  stakeAmount: number;
  /** Số dòng cược trong entry. */
  lineCount: number;
  /** Tóm tắt entry. */
  entrySummary: {
    /** Tổng số dòng cược. */
    totalLines: number;
  };
  /** Kết quả quay (chỉ có khi kỳ đã công bố kết quả). */
  result?: {
    /** 6 số chính trúng thưởng. */
    winningMain: number[];
    /** Số bonus. */
    bonusNumber: number;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả tổng: "win" hoặc "loss" (chỉ có sau settle). */
  outcome?: string;
  /** Chi tiết trả thưởng (chỉ có khi entry thắng). */
  payout?: {
    /** Tổng tiền thắng trước payout (VND). */
    winAmount: number;
    /** Số tiền trả thưởng thực tế (VND). */
    payoutAmount: number;
    /** Chi tiết thắng theo từng tier giải. */
    tiers: Array<{
      /** Tier giải thưởng (jackpot1 / jackpot2 / tier3 / tier4 / tier5). */
      tier: string;
      /** Số dòng trúng tier này. */
      matchCount: number;
      /** Giá trị giải mỗi dòng (VND). */
      prizePerLine: number;
      /** Tổng giải cho tier = prizePerLine × matchCount (VND). */
      totalPrize: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Thông tin tóm tắt của vé. */
  ticket: PlayerTicketSummary;
  /** Danh sách entries theo từng kỳ quay. */
  entries: PlayerEntryInfo[];
}

// ─── Get Entry Lines (Player) ───

export interface PlayerGetEntryLinesInput {
  /** ID tenant (đại lý) của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** ID entry cần xem chi tiết dòng cược. */
  entryId: string;
  /** Trang hiện tại (1-based). */
  page: number;
  /** Số lượng dòng mỗi trang. */
  size: number;
}

export interface PlayerLineInfo {
  /** Mã board chứa dòng này (A, B, C, ...). */
  boardNo: string;
  /** Chỉ số dòng trong board (0-based). */
  lineIndex: number;
  /** 6 số chính của dòng cược (trong range [1, 55]). */
  main: number[];
  /** Kết quả so khớp của dòng với kết quả quay. */
  matchResult: {
    /** Số lượng số chính trùng khớp (0-6). */
    mainMatchCount: number;
    /** Có trùng số bonus hay không. */
    bonusMatched: boolean;
    /**
     * Tier giải thưởng cao nhất (null nếu không trúng).
     * - jackpot1: trùng 6/6 số chính
     * - jackpot2: trùng 5/6 + bonus
     * - tier3: trùng 5/6 (không bonus)
     * - tier4: trùng 4/6
     * - tier5: trùng 3/6
     */
    tier: string | null;
    /** Giá trị giải thưởng cho dòng này (VND). 0 nếu không trúng hoặc là jackpot (trả riêng). */
    prizeAmount: number;
  };
}

export interface PlayerGetEntryLinesOutput {
  /** ID entry đang xem. */
  entryId: string;
  /** ID kỳ quay mà entry thuộc về. */
  drawId: string;
  /** Danh sách dòng cược trong trang hiện tại. */
  lines: PlayerLineInfo[];
  /** Tổng số dòng cược của entry. */
  total: number;
  /** Trang hiện tại. */
  page: number;
  /** Số lượng mỗi trang. */
  size: number;
}
