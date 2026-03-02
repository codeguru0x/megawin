/**
 * Mega 6/45 – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Mega 6/45 không có số đặc biệt — chỉ mainNumbers.
 */

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  /** Kỳ quay hiện tại (null nếu không có kỳ nào active). */
  currentDraw: PlayerDrawInfo | null;
  /** Tất cả các kỳ đang active, sắp xếp theo drawDate tăng dần. */
  activeDraws: PlayerDrawInfo[];
  /** Giá trị jackpot hiện tại từ active cycle (VND). */
  jackpotCurrentAmount: number;
  /** Kết quả quay gần nhất (null nếu chưa có kỳ nào settle). */
  lastResult: {
    /** ID kỳ quay đã settle gần nhất. */
    drawId: string;
    /** Ngày quay thưởng (ISO date). */
    drawDate: string;
    /** Số thứ tự kỳ quay. */
    drawNo: number;
    /** 6 số chính trúng thưởng (1-45). */
    winningMain: number[];
    /** Thời điểm công bố kết quả (ISO datetime). */
    publishedAt: string;
  } | null;
}

export interface PlayerDrawInfo {
  /** ID duy nhất của kỳ quay. */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Giờ quay thưởng, ví dụ "18:00". */
  drawTime: string;
  /** Trạng thái kỳ quay (salesOpen, salesClosed, ...). */
  status: string;
  /** Thời gian mở/đóng bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO datetime, undefined nếu chưa mở). */
    openAt?: string;
    /** Thời điểm đóng bán (ISO datetime). */
    closeAt: string;
  };
  /** Giá trị jackpot hiện tại (VND) tại thời điểm truy vấn. */
  jackpotCurrentAmount: number;
}

// ─── Get Jackpot (Player) ───

export interface PlayerGetJackpotOutput {
  /** Giá trị jackpot hiện tại (VND). */
  currentAmount: number;
  /** Giá trị khởi tạo (seed) khi bắt đầu cycle mới (VND). */
  seedAmount: number;
  /** Tiến trình jackpot hướng tới ngưỡng split. */
  progress: {
    /** Giá trị jackpot hiện tại (VND) — bằng currentAmount. */
    current: number;
    /** Ngưỡng split jackpot (VND). Khi đạt → tự động chia. */
    threshold: number;
    /** Phần trăm tiến trình = (current / threshold) × 100. */
    percentage: number;
  };
  /** Kỳ quay tiếp theo (nếu có). */
  nextDraw?: {
    /** ID kỳ quay tiếp theo. */
    drawId: string;
    /** Giờ quay thưởng của kỳ tiếp theo. */
    drawTime: string;
  };
}

// ─── List Tickets (Player) ───

export type TicketSortBy = "betDate" | "drawDate";

export const TICKET_SORT_BY_VALUES: readonly TicketSortBy[] = [
  "betDate",
  "drawDate",
];

export interface PlayerListPendingTicketsInput {
  /** ID tenant của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Số lượng vé tối đa mỗi trang. */
  size: number;
  /** Cursor cho phân trang (opaque string từ response trước). */
  cursor?: string;
}

export interface PlayerListCompletedTicketsInput {
  /** ID tenant của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Số lượng vé tối đa mỗi trang. */
  size: number;
  /** Sắp xếp theo ngày đặt vé hoặc ngày quay. */
  sortBy: TicketSortBy;
  /** Ngày bắt đầu lọc (ISO date, inclusive). */
  from?: string;
  /** Ngày kết thúc lọc (ISO date, inclusive). */
  to?: string;
  /** Cursor cho phân trang (opaque string từ response trước). */
  cursor?: string;
}

export interface PlayerTicketSummary {
  /** MongoDB document ID. */
  id: string;
  /** Mã vé hiển thị cho người chơi (human-readable). */
  ticketNo: string;
  /** Trạng thái vé (active, completed, voided). */
  status: string;
  /** Thông tin các kỳ quay đã đăng ký. */
  drawPlan: {
    /** Danh sách ID các kỳ quay đã đăng ký. */
    drawIds: string[];
    /** Tổng số kỳ quay tham gia. */
    drawCount: number;
  };
  /**
   * Chi tiết giá vé.
   *
   * Công thức: totalAmount = unitPrice × linesPerDraw × drawCount.
   */
  pricing: {
    /** Đơn giá 1 dòng (VND). */
    unitPrice: number;
    /** Tổng số dòng mỗi kỳ = ΣC(n,6) cho tất cả board. */
    linesPerDraw: number;
    /** Số tiền mỗi kỳ = unitPrice × linesPerDraw (VND). */
    amountPerDraw: number;
    /** Tổng tiền vé = amountPerDraw × drawCount (VND). */
    totalAmount: number;
  };
  /** Danh sách board chọn số trong vé. */
  boards: Array<{
    /** Mã board (A, B, C...). */
    boardNo: string;
    /** Loại cách chơi (normal / system). */
    playType: string;
    /** Các số đã chọn. */
    selection: {
      /** Danh sách số chính đã chọn (6-15 số, khoảng 1-45). */
      mainNumbers: number[];
    };
    /** Số dòng expand ra từ board này = C(n,6) với n = số lượng mainNumbers. */
    expandedLines: number;
  }>;
  /** Tiến trình xử lý vé qua các kỳ quay. */
  progress: {
    /** Tổng số kỳ quay đã đăng ký. */
    totalDraws: number;
    /** Số kỳ đã settle xong. */
    settledDraws: number;
  };
  /** Tổng hợp kết quả trúng thưởng (chỉ có sau khi settle). */
  settlement?: {
    /** Tổng tiền thắng từ tất cả các kỳ đã settle (VND). */
    totalWinAmount: number;
  };
  /** Thời điểm tạo vé (ISO datetime). */
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  /** Danh sách vé. */
  tickets: PlayerTicketSummary[];
  /** Cursor cho trang tiếp theo (null nếu hết dữ liệu). */
  nextCursor: string | null;
  /** Số bản ghi trả về. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** ID tenant của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** ID vé cần xem entries. */
  ticketId: string;
}

export interface PlayerEntryInfo {
  /** MongoDB document ID. */
  id: string;
  /** ID kỳ quay entry thuộc về. */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Giờ quay thưởng. */
  drawTime: string;
  /** Trạng thái entry (drawn, settled, voided...). */
  status: string;
  /** Số tiền entry = unitPrice × tổng dòng (VND). */
  amount: number;
  /** Tổng số dòng trong entry. */
  lineCount: number;
  /** Tóm tắt entry (dùng cho hiển thị). */
  entrySummary: {
    /** Mã vé chứa entry này. */
    ticketNo: string;
    /** Danh sách board trong entry. */
    boards: Array<{
      /** Mã board (A, B, C...). */
      boardNo: string;
      /** Loại cách chơi (normal / system). */
      playType: string;
      /** Danh sách số chính đã chọn (1-45). */
      mainNumbers: number[];
      /** Số dòng expand ra = C(n,6). */
      expandedLines: number;
    }>;
  };
  /** Kết quả quay thưởng (chỉ có khi kỳ đã công bố). */
  result?: {
    /** 6 số chính trúng thưởng (1-45). */
    winningMain: number[];
    /** Thời điểm công bố kết quả (ISO datetime). */
    publishedAt: string;
  };
  /** Kết quả tổng hợp của entry: "win" | "loss" (chỉ có sau settle). */
  outcome?: string;
  /** Chi tiết trả thưởng (chỉ có nếu outcome = "win"). */
  payout?: {
    /** Tổng tiền thắng (VND) — chưa trừ thuế. */
    winAmount: number;
    /** Số tiền thực trả cho người chơi (VND). */
    payoutAmount: number;
    /** Chi tiết từng hạng giải đã trúng. */
    tiers: Array<{
      /** Hạng giải: "jackpot" (6/6), "tier2" (5/6), "tier3" (4/6), "tier4" (3/6). */
      tier: string;
      /** Số dòng trúng hạng này. */
      hitCount: number;
      /** Tiền thưởng mỗi dòng (VND). */
      unitAmount: number;
      /** Tổng tiền thưởng hạng này = unitAmount × hitCount (VND). */
      amount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Thông tin tóm tắt vé. */
  ticket: PlayerTicketSummary;
  /** Danh sách entries (mỗi kỳ quay = 1 entry). */
  entries: PlayerEntryInfo[];
}

// ─── Get Entry Lines (Player) ───

export interface PlayerGetEntryLinesInput {
  /** ID tenant của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** ID entry cần xem chi tiết dòng. */
  entryId: string;
  /** Trang hiện tại (1-based). */
  page: number;
  /** Số dòng mỗi trang. */
  size: number;
}

export interface PlayerLineInfo {
  /** Mã board chứa dòng này (A, B, C...). */
  boardNo: string;
  /** Chỉ số dòng trong board (0-based). */
  lineIndex: number;
  /** 6 số chính của dòng (1-45), đã sort ascending. */
  main: number[];
  /** Kết quả so khớp dòng với kết quả quay. */
  matchResult: {
    /** Số lượng số chính khớp (0-6). */
    mainMatchCount: number;
    /** Hạng giải: "jackpot" (6/6), "tier2" (5/6), "tier3" (4/6), "tier4" (3/6), null nếu không trúng. */
    tier: string | null;
    /** Tiền thưởng dòng này (VND). Jackpot = 0 tại đây, tính riêng qua split. */
    winAmount: number;
  };
}

export interface PlayerGetEntryLinesOutput {
  /** ID entry đang xem. */
  entryId: string;
  /** ID kỳ quay entry thuộc về. */
  drawId: string;
  /** Danh sách dòng trong trang hiện tại. */
  lines: PlayerLineInfo[];
  /** Tổng số dòng trong entry. */
  total: number;
  /** Trang hiện tại. */
  page: number;
  /** Số dòng mỗi trang. */
  size: number;
}
