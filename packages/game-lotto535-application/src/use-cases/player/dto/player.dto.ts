/**
 * Lotto 5/35 – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 */

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  /** Kỳ quay active đầu tiên (backward compat, null nếu không có). */
  currentDraw: PlayerDrawInfo | null;
  /** Tất cả kỳ quay đang active, sorted theo drawDate + drawNo asc. */
  activeDraws: PlayerDrawInfo[];
}

export interface PlayerDrawInfo {
  /** Mã định danh kỳ quay (UUID). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = sáng 13h, 2 = tối 21h). */
  drawNo: number;
  /** Giờ quay (HH:mm). */
  drawTime: string;
  /** Trạng thái kỳ quay (vd: "salesOpen", "salesClosed"). */
  status: string;
  /** Thông tin thời gian bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO 8601), undefined nếu chưa mở. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

// ─── Get Jackpot (Player) ───

export interface PlayerGetJackpotOutput {
  /** Số thứ tự cycle (tự tăng). */
  cycleNo: number;
  /** Số tiền Jackpot hiện tại (VND). */
  currentAmount: number;
  /** Số tiền khởi điểm Jackpot (VND) — seed khi bắt đầu cycle mới. */
  seedAmount: number;
  /** Số tiền Jackpot cao nhất đạt được trong cycle hiện tại (VND). */
  peakAmount: number;
  /** Tổng tiền đã tích lũy từ đầu cycle (VND). */
  totalContribution: number;
  /** Số kỳ đã settled trong cycle hiện tại. */
  drawCount: number;

  /** Mã kỳ quay bắt đầu cycle. */
  startDrawId: string;

  /** Tiến trình tích luỹ Jackpot hướng tới ngưỡng chia. */
  progress: {
    /** Ngưỡng kích hoạt chia Jackpot (VND). */
    splitThreshold: number;
    /** Phần trăm tiến trình (0-100) = (currentAmount / threshold) × 100. */
    percentage: number;
  };
}

// ─── List Tickets (Player) ───

export interface PlayerListTicketsInput {
  /** Mã tenant của player. */
  tenantId: string;
  /** Mã tài khoản player. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD, inclusive). */
  to?: string;
  /** Cursor phân trang (ticketId cuối trang trước). */
  cursor?: string;
}

/**
 * Input để lấy danh sách vé đang pending của player.
 *
 * Không có from/to — pending tickets trả về TẤT CẢ vé chưa settle/void,
 * sắp xếp mới nhất trước. Player không cần nhớ ngày mua; hệ thống tự trả đủ
 * qua cursor-based pagination.
 */
export interface PlayerListPendingTicketsInput {
  /** Mã tenant của player. */
  tenantId: string;
  /** Mã tài khoản player. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Cursor phân trang (ticketId cuối trang trước). */
  cursor?: string;
}

export interface PlayerTicketSummary {
  /** MongoDB document ID. */
  id: string;
  /** Số vé hiển thị (human-readable). */
  ticketNo: string;
  /** Trạng thái vé (active, completed, voided, ...). */
  status: string;
  /** Kế hoạch tham gia các kỳ quay. */
  drawPlan: {
    /** Danh sách mã kỳ quay đã đăng ký. */
    drawIds: string[];
    /** Số kỳ quay tham gia = drawIds.length. */
    drawCount: number;
  };
  /**
   * Chi tiết giá vé.
   *
   * Công thức:
   * - linesPerDraw = Σ(board.expandedLines)
   * - amountPerDraw = linesPerDraw × unitPrice
   * - totalAmount = amountPerDraw × drawCount
   */
  pricing: {
    /** Đơn giá 1 line cho 1 kỳ (VND). */
    unitPrice: number;
    /** Tổng lines mỗi kỳ = Σ(board.expandedLines). */
    linesPerDraw: number;
    /** Giá mỗi kỳ (VND) = linesPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền toàn vé (VND) = amountPerDraw × drawCount. */
    totalAmount: number;
  };
  /** Danh sách boards trên vé. */
  boards: Array<{
    /** Ký hiệu bảng (A, B, C, D, E). */
    boardNo: string;
    /** Kiểu chơi (normal, system, ...). */
    playType: string;
    /** Bộ số đã chọn. */
    selection: {
      /** Danh sách số chính đã chọn ("01"-"35"). */
      mainNumbers: string[];
      /** Danh sách số đặc biệt đã chọn ("01"-"12"). */
      specialNumbers: string[];
    };
    /** Số lines được expand từ selection (tùy playType). */
    expandedLines: number;
  }>;
  /** Tiến trình settle qua các kỳ. settledDraws = số kỳ đã xử lý xong (settled + voided). */
  progress: {
    /** Tổng số kỳ đã đăng ký. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong (settled + voided). */
    settledDraws: number;
  };
  /** Tổng kết trúng thưởng — chỉ có khi đã settle ít nhất 1 kỳ. */
  settlement?: {
    /** Tổng tiền thắng (VND) = Σ(entry.winAmount) qua tất cả kỳ. */
    totalWinAmount: number;
    /** Thời điểm kỳ gần nhất được settle (ISO 8601). */
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. Có khi ít nhất 1 kỳ bị void.
   * Multi-draw: hoàn tiền một phần. Single-draw: hoàn toàn bộ → status = "refunded".
   */
  voidSummary?: {
    /** Tổng tiền cược gốc của các kỳ bị huỷ (VND). */
    totalVoidedAmount: number;
    /** Tổng tiền đã hoàn trả cho player (VND). */
    totalRefundedAmount: number;
    /** Số kỳ đã bị huỷ. */
    voidedDrawCount: number;
    /** Danh sách drawId của các kỳ đã bị huỷ. */
    voidedDrawIds: string[];
    /** Thời điểm kỳ gần nhất bị huỷ (ISO 8601). */
    lastVoidedAt?: string;
  };
  /** Thời điểm tạo vé (ISO 8601). */
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  /** Danh sách vé tóm tắt. */
  tickets: PlayerTicketSummary[];
  /** Cursor cho trang tiếp theo (null nếu hết dữ liệu). */
  nextCursor: string | null;
  /** Số lượng mỗi trang. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** Mã tenant của player. */
  tenantId: string;
  /** Mã tài khoản player. */
  accountId: string;
  /** Mã vé cần xem chi tiết entries. */
  ticketId: string;
}

export interface PlayerEntryInfo {
  /** MongoDB document ID. */
  id: string;
  /** Mã kỳ quay mà entry tham gia. */
  drawId: string;
  /** Trạng thái entry (scheduled, settled, voided, ...). */
  status: string;
  /** Số tiền đặt cược cho entry này (VND) = linesPerDraw × unitPrice. */
  amount: number;
  /** Tổng số lines trong entry = Σ(board.expandedLines). */
  lineCount: number;
  /** Tóm tắt nội dung vé gốc. */
  entrySummary: {
    /** Số vé hiển thị. */
    ticketNo: string;
    /** Danh sách boards và bộ số đã chọn. */
    boards: Array<{
      /** Ký hiệu bảng (A-E). */
      boardNo: string;
      /** Kiểu chơi. */
      playType: string;
      /** Danh sách số chính ("01"-"35"). */
      mainNumbers: string[];
      /** Danh sách số đặc biệt ("01"-"12"). */
      specialNumbers: string[];
      /** Số lines expand từ selection. */
      expandedLines: number;
    }>;
  };
  /** Kết quả quay — chỉ có khi kỳ đã công bố. */
  result?: {
    /** 5 số chính trúng thưởng (sorted, zero-padded "01"-"35"). */
    winningMain: string[];
    /** Số đặc biệt trúng thưởng ("01"-"12"). */
    winningSpecial: string;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả win/loss tổng thể của entry ("win" | "loss"). */
  outcome?: string;
  /**
   * Chi tiết trả thưởng — chỉ có khi entry đã settled và có giải.
   *
   * winAmount = Σ(tier.amount) — tổng tiền thắng từ giải cố định.
   * payoutAmount = winAmount (+ splitBonus nếu có kỳ chia Jackpot).
   */
  payout?: {
    /** Tổng tiền thắng từ giải cố định (VND). */
    winAmount: number;
    /** Tổng tiền trả thưởng (VND) = winAmount + splitBonus (nếu có). */
    payoutAmount: number;
    /** Chi tiết giải thưởng theo từng tier. */
    tiers: Array<{
      /** Hạng giải (jackpot, tier1, tier2, ..., consolation). */
      tier: string;
      /** Số lần trúng tier này trong entry. */
      hitCount: number;
      /** Giá trị 1 lần trúng (VND). Jackpot = 0 (trả riêng qua split). */
      unitAmount: number;
      /** Tổng tiền tier này (VND) = hitCount × unitAmount. */
      amount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Thông tin tóm tắt vé. */
  ticket: PlayerTicketSummary;
  /** Danh sách entries theo từng kỳ quay. */
  entries: PlayerEntryInfo[];
}

// ─── Get Entry Lines (Player) ───

export interface PlayerGetEntryLinesInput {
  /** Mã tenant của player. */
  tenantId: string;
  /** Mã tài khoản player. */
  accountId: string;
  /** Mã entry cần xem chi tiết lines. */
  entryId: string;
  /** Số lines mỗi trang. */
  size: number;
  /** lineIndex của phần tử cuối cùng trang trước (cursor). */
  cursor?: number;
}

export interface PlayerLineInfo {
  /** Ký hiệu bảng chứa line này (A-E). */
  boardNo: string;
  /** Thứ tự line trong board (0-based). */
  lineIndex: number;
  /** 5 số chính của line (sorted, zero-padded "01"-"35"). */
  main: string[];
  /** Số đặc biệt của line ("01"-"12"). */
  special: string;
  /** Kết quả so khớp với kết quả quay. */
  matchResult: {
    /** Số lượng số chính trùng khớp (0-5). */
    mainMatchCount: number;
    /** Số đặc biệt có trùng hay không. */
    specialMatched: boolean;
    /** Hạng giải đạt được (null nếu không trúng). */
    tier: string | null;
    /** Tiền thắng cho line này (VND). Jackpot = 0 (trả qua split). */
    winAmount: number;
  };
}

export interface PlayerGetEntryLinesOutput {
  /** Mã entry. */
  entryId: string;
  /** Mã kỳ quay. */
  drawId: string;
  /** Danh sách lines trong trang hiện tại. */
  lines: PlayerLineInfo[];
  /** Cursor cho trang tiếp theo. Null nếu hết dữ liệu. */
  nextCursor: number | null;
  /** Số lines mỗi trang. */
  size: number;
}

// ─── Draw Results (Player) ───

export interface PlayerListDrawResultsInput {
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). Handler luôn truyền (default = today VN). */
  from: string;
  /** Số lượng kết quả mỗi trang. */
  size: number;
  /** Cursor phân trang (drawId cuối trang trước). */
  cursor?: string;
}

export interface PlayerDrawResultInfo {
  /** Mã kỳ quay (VD: "2026-03-05.001"). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = 13h, 2 = 21h). */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /** Kết quả quay. */
  result: {
    /** 5 số chính trúng thưởng (sorted, zero-padded "01"-"35"). */
    winningMain: string[];
    /** Số đặc biệt trúng thưởng ("01"-"12"). */
    winningSpecial: string;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Jackpot snapshot kỳ quay. */
  jackpot: {
    /** Jackpot đầu kỳ (VND). */
    openingAmount: number;
    /** Jackpot cuối kỳ (VND). */
    closingAmount: number;
    /** Kỳ chia giải Jackpot? */
    isSplitCycle?: boolean;
  };
  /** Chi tiết giải thưởng từng tier. */
  prizes: PlayerDrawTierPrize[];
  /** Tham chiếu Vietlott (nếu có). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface PlayerDrawTierPrize {
  /** Hạng giải (jackpot, tier1, ..., consolation). */
  tier: string;
  /** Số lượt trúng tier này. */
  winnerCount: number;
  /** Tổng tiền thưởng tier này (VND). */
  prizeAmount: number;
}

/**
 * Tóm tắt 1 kỳ quay Lotto 5/35 trong danh sách — kết quả + jackpot snapshot, không có bảng giải thưởng chi tiết.
 * Dùng bởi GET /games/lotto535/draw-results (list).
 * Prize details xem ở GET /games/lotto535/draw-results/:drawId (detail).
 */
export interface PlayerDrawResultSummary {
  /** Mã kỳ quay (VD: "2026-03-05.001"). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (1 = 13h, 2 = 21h). */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /** Kết quả quay. */
  result: {
    /** 5 số chính trúng thưởng (sorted, zero-padded "01"-"35"). */
    winningMain: string[];
    /** Số đặc biệt trúng thưởng ("01"-"12"). */
    winningSpecial: string;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Jackpot snapshot kỳ quay — hữu ích để hiển thị kỳ có trúng Jackpot không. */
  jackpot: {
    /** Jackpot đầu kỳ (VND). */
    openingAmount: number;
    /** Jackpot cuối kỳ (VND). */
    closingAmount: number;
    /** Kỳ chia giải Jackpot? */
    isSplitCycle?: boolean;
  };
  /** Tham chiếu Vietlott (nếu có). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface PlayerListDrawResultsOutput {
  /** Danh sách tóm tắt kỳ quay. */
  draws: PlayerDrawResultSummary[];
  /** Cursor cho trang tiếp theo (drawId). Null nếu hết dữ liệu. */
  nextCursor: string | null;
  /** Số lượng mỗi trang. */
  size: number;
}
