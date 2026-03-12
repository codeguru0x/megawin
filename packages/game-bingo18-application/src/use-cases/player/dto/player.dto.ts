/**
 * Bingo 18 – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 */

import type { Bingo18BigSmallBet, Bingo18TripleKind } from "@megawin/game-bingo18/entities";

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  /** Kỳ quay hiện tại (null nếu không có kỳ nào mở bán). */
  currentDraw: PlayerDrawInfo | null;
  /** Danh sách kỳ quay đang hoạt động. */
  activeDraws: PlayerDrawInfo[];
  /** Kết quả kỳ quay gần nhất (null nếu chưa có kỳ nào kết thúc). */
  lastResult: {
    /** ID kỳ quay. */
    drawId: string;
    /** Ngày quay (YYYY-MM-DD). */
    drawDate: string;
    /** Số thứ tự kỳ trong ngày. */
    drawNo: number;
    /** 3 số kết quả (1-6). */
    numbers: number[];
    /** Tổng 3 số = numbers[0] + numbers[1] + numbers[2]. */
    sum: number;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  } | null;
}

export interface PlayerDrawInfo {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Trạng thái kỳ quay (salesOpen, salesClosed, …). */
  status: string;
  /** Thông tin mở/đóng bán. */
  sales: {
    /** Thời điểm mở bán (ISO 8601). */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

// ─── List Tickets (Player) ───

/**
 * Cursor-based pagination cho danh sách vé.
 */

export const TicketSortBy = {
  BetDate: "betDate",
  DrawDate: "drawDate",
} as const;

export type TicketSortBy = (typeof TicketSortBy)[keyof typeof TicketSortBy];

export const TICKET_SORT_BY_VALUES = Object.values(TicketSortBy);

export interface PlayerListTicketsInput {
  /** ID tenant của player. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD, inclusive). */
  to?: string;
  /** Cursor để phân trang (opaque string từ response trước). */
  cursor?: string;
}

export interface PlayerListPendingTicketsInput {
  /** ID tenant của player. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD, inclusive). */
  to?: string;
  /** Cursor để phân trang (opaque string từ response trước). */
  cursor?: string;
}

export interface PlayerListCompletedTicketsInput {
  /** ID tenant của player. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Tiêu chí sắp xếp (betDate | drawDate). */
  sortBy: TicketSortBy;
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD, inclusive). */
  to?: string;
  /** Cursor để phân trang (opaque string từ response trước). */
  cursor?: string;
}

export interface PlayerTicketSummary {
  /** MongoDB document ID. */
  id: string;
  /** Mã vé hiển thị cho player. */
  ticketNo: string;
  /** Trạng thái vé (pending, completed, void, …). */
  status: string;
  /** Kế hoạch kỳ quay đã đăng ký. */
  drawPlan: {
    /** Danh sách drawId đã đăng ký. */
    drawIds: string[];
    /** Tổng số kỳ quay = drawIds.length. */
    drawCount: number;
  };
  /** Thông tin giá vé. */
  pricing: {
    /** Đơn giá 1 lượt chơi (VND). */
    unitPrice: number;
    /** Số lượt đặt mỗi kỳ = boards.length + sideBets.length. */
    betsPerDraw: number;
    /** Tiền mỗi kỳ = unitPrice × betsPerDraw. */
    amountPerDraw: number;
    /** Tổng tiền vé = amountPerDraw × drawCount. */
    totalAmount: number;
  };
  /** Danh sách bảng chơi chính (SingleNum, DoubleMatch, TripleMatch). */
  boards: Array<{
    /** Số thứ tự bảng (A, B, C, …). */
    boardNo: string;
    /** Loại chơi (singleNum, doubleMatch, tripleMatch). */
    playType: string;
    /** Số đã chọn (1-6). Áp dụng cho singleNum, doubleMatch. */
    number?: number;
    /** Loại bộ ba (specific | any). Áp dụng cho tripleMatch. */
    tripleKind?: string;
  }>;
  /** Danh sách cược phụ (SumTotal, BigSmallDraw). */
  sideBets: Array<{
    /** Loại cược phụ (sumTotal, bigSmallDraw). */
    playType: string;
    /** Tổng dự đoán (3-18). Áp dụng cho sumTotal. */
    sum?: number;
    /** Lựa chọn Tài/Xỉu/Hoà (big | small | draw). Áp dụng cho bigSmallDraw. */
    bet?: string;
  }>;
  /**
   * Tiến độ settle. settledDraws = số kỳ đã xử lý xong (settled + voided).
   * Để biết cụ thể bao nhiêu kỳ voided, xem voidSummary.voidedDrawCount.
   */
  progress: {
    /** Tổng số kỳ đã đăng ký. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong (settled + voided). */
    settledDraws: number;
  };
  /** Tổng kết trả thưởng. Undefined nếu chưa có kỳ nào settle. */
  settlement?: {
    /** Tổng tiền thắng cộng dồn (VND) = Σ(entry.winAmount) qua tất cả kỳ settle. */
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
  /** Danh sách vé. */
  tickets: PlayerTicketSummary[];
  /** Cursor cho trang tiếp theo (null nếu hết). */
  nextCursor: string | null;
  /** Kích thước trang đã yêu cầu. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** ID tenant của player. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** ID vé cần xem chi tiết entries. */
  ticketId: string;
}

export interface PlayerEntryInfo {
  /** MongoDB document ID của entry. */
  id: string;
  /** ID kỳ quay mà entry tham gia. */
  drawId: string;
  /** Trạng thái entry (scheduled, settled, void). */
  status: string;
  /** Số tiền đặt cược của entry (VND). */
  amount: number;
  /** Số lượt cược trong entry = boards + sideBets. */
  betCount: number;
  /** Tóm tắt nội dung đặt cược. */
  entrySummary: {
    /** Mã vé hiển thị. */
    ticketNo: string;
    /** Danh sách bảng chơi chính. */
    boards: Array<{
      /** Số thứ tự bảng (A, B, C, …). */
      boardNo: string;
      /** Loại chơi (singleNum, doubleMatch, tripleMatch). */
      playType: string;
      /** Số đã chọn (1-6). */
      number?: number;
      /** Loại bộ ba (specific | any). */
      tripleKind?: string;
    }>;
    /** Danh sách cược phụ. */
    sideBets: Array<{
      /** Loại cược phụ (sumTotal, bigSmallDraw). */
      playType: string;
      /** Tổng dự đoán (3-18). */
      sum?: number;
      /** Lựa chọn Tài/Xỉu/Hoà (big | small | draw). */
      bet?: string;
    }>;
  };
  /** Kết quả quay (chỉ có sau khi publish). */
  result?: {
    /** 3 số kết quả (1-6). */
    numbers: number[];
    /** Tổng 3 số = numbers[0] + numbers[1] + numbers[2]. */
    sum: number;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả thắng/thua (win | loss). Chỉ có sau settle. */
  outcome?: string;
  /** Chi tiết trả thưởng (chỉ có sau settle). */
  payout?: {
    /** Tổng tiền thắng (VND) = Σ(boardPayouts.winAmount) + Σ(sideBetPayouts.winAmount). */
    winAmount: number;
    /** Số tiền thực trả = winAmount (Bingo18 không có cap). */
    payoutAmount: number;
    /** Chi tiết trả thưởng từng bảng chơi chính. */
    boardPayouts: Array<{
      /** Số thứ tự bảng. */
      boardNo: string;
      /** Loại chơi. */
      playType: string;
      /** Số lượng số trùng khớp (0-3). */
      matchCount: number;
      /** Tiền thắng bảng này (VND). */
      winAmount: number;
    }>;
    /** Chi tiết trả thưởng từng cược phụ. */
    sideBetPayouts: Array<{
      /** Loại cược phụ. */
      playType: string;
      /** Tổng dự đoán (áp dụng cho sumTotal). */
      sum?: number;
      /** Lựa chọn Tài/Xỉu/Hoà (áp dụng cho bigSmallDraw). */
      bet?: string;
      /** Kết quả thực tế (exact, big, small, draw, …). */
      outcome: string;
      /** true nếu cược phụ thắng. */
      isWin: boolean;
      /** Tiền thắng cược phụ này (VND). */
      winAmount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Thông tin tóm tắt vé. */
  ticket: PlayerTicketSummary;
  /** Danh sách entries thuộc vé, mỗi entry ứng với 1 kỳ quay. */
  entries: PlayerEntryInfo[];
}

// ─── Draw Results (Player) ───

/**
 * Giải thưởng 1 loại cược cơ bản trong kỳ quay — dùng cho GetDrawResult API.
 *
 * Chỉ trả những loại chơi có winnerCount > 0 trong kỳ.
 */
export interface PlayerBasicPrize {
  /**
   * Loại cược: "singleNum" | "doubleMatch" | "tripleMatch".
   */
  playType: string;
  /**
   * Số lần số đã chọn xuất hiện trong kết quả (1-3).
   * singleNum: giải thưởng khác nhau theo matchCount (12k/20k/30k).
   * doubleMatch / tripleMatch: luôn = 1.
   */
  matchCount: number;
  /**
   * Phân loại triple: "specific" (1.200.000đ) hoặc "any" (200.000đ).
   * Chỉ có với tripleMatch — undefined với singleNum và doubleMatch.
   */
  tripleKind?: Bingo18TripleKind;
  /** Số lượt cược trúng tổ hợp này. */
  winnerCount: number;
  /** Tiền thưởng mỗi lần cược (VND). */
  prizePerUnit: number;
}

/**
 * Giải thưởng 1 loại side bet trong kỳ quay — dùng cho GetDrawResult API.
 *
 * Chỉ trả những (playType, sum/bet) có winnerCount > 0 trong kỳ.
 */
export interface PlayerSideBetPrize {
  /**
   * Loại side bet: "sumTotal" | "bigSmallDraw".
   */
  playType: string;
  /**
   * Tổng cụ thể đã trúng (3-18). Chỉ có với sumTotal.
   * undefined với bigSmallDraw.
   */
  sum?: number;
  /**
   * Cược Lớn/Hòa/Nhỏ đã trúng. Chỉ có với bigSmallDraw.
   * undefined với sumTotal.
   */
  bet?: Bingo18BigSmallBet;
  /** Số lượt cược trúng (playType, sum/bet) này. */
  winnerCount: number;
  /** Tiền thưởng mỗi lần cược (VND). */
  prizePerUnit: number;
}

/** Kết quả chi tiết 1 kỳ quay đã settle — dùng cho GetDrawResult API. */
export interface PlayerDrawResultInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  /** Kết quả quay thưởng. */
  result: {
    /** 3 số kết quả (giữ nguyên thứ tự quay). */
    numbers: number[];
    /** Tổng 3 số (3-18). */
    sum: number;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /**
   * Bảng giải thưởng cơ bản — chỉ chứa loại chơi có người trúng.
   * Grouped theo (playType, matchCount).
   */
  basicPrizes: PlayerBasicPrize[];
  /**
   * Bảng giải thưởng side bet — chỉ chứa (playType, bet) có người trúng.
   */
  sideBetPrizes: PlayerSideBetPrize[];
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/**
 * Tóm tắt 1 kỳ quay trong danh sách — không có bảng giải chi tiết.
 * Dùng bởi GET /games/bingo18/draw-results (list).
 * Bảng giải chi tiết xem tại GET /games/bingo18/draw-results/:drawId.
 */
export interface PlayerDrawResultSummary {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  result: {
    numbers: number[];
    sum: number;
    publishedAt: string;
  };
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface PlayerListDrawResultsInput {
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). Handler luôn truyền (default = today VN). */
  from: string;
  size: number;
  cursor?: string;
}

export interface PlayerListDrawResultsOutput {
  draws: PlayerDrawResultSummary[];
  nextCursor: string | null;
  size: number;
}
