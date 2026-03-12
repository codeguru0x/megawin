/**
 * Max 3D – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 */

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  /** Kỳ quay active đầu tiên (backward compat), null nếu không có. */
  currentDraw: PlayerDrawInfo | null;
  /** Tất cả kỳ quay đang active, sorted drawDate+drawNo asc. */
  activeDraws: PlayerDrawInfo[];
  /** Kết quả kỳ quay gần nhất đã có kết quả, null nếu chưa có. */
  lastResult: {
    /** ID kỳ quay. */
    drawId: string;
    /** Ngày quay (YYYY-MM-DD). */
    drawDate: string;
    /** Số thứ tự kỳ quay trong ngày. */
    drawNo: number;
    /** Giải đặc biệt (2 bộ ba số). */
    special: [string, string];
    /** Giải nhất (4 bộ ba số). */
    first: [string, string, string, string];
    /** Giải nhì (6 bộ ba số). */
    second: [string, string, string, string, string, string];
    /** Giải ba (8 bộ ba số). */
    third: [string, string, string, string, string, string, string, string];
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  } | null;
}

export interface PlayerDrawInfo {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Giờ quay dự kiến (ISO 8601). */
  drawTime: string;
  /** Trạng thái kỳ quay (scheduled / salesOpen / salesClosed / …). */
  status: string;
  sales: {
    /** Thời điểm mở bán (ISO 8601), undefined nếu chưa xác định. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

// ─── List Tickets (Player) ───

export type TicketSortBy = "betDate" | "drawDate";

export const TICKET_SORT_BY_VALUES: readonly TicketSortBy[] = ["betDate", "drawDate"];

export interface PlayerListTicketsInput {
  /** ID đại lý / tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng vé trả về mỗi trang. */
  size: number;
  /** Lọc từ ngày (YYYY-MM-DD), bao gồm. */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD), bao gồm. */
  to?: string;
  /** Con trỏ phân trang (cursor-based pagination). */
  cursor?: string;
}

export interface PlayerListPendingTicketsInput {
  /** ID đại lý / tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng vé trả về mỗi trang. */
  size: number;
  /** Lọc từ ngày (YYYY-MM-DD), bao gồm. */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD), bao gồm. */
  to?: string;
  /** Con trỏ phân trang (cursor-based pagination). */
  cursor?: string;
}

export interface PlayerListCompletedTicketsInput {
  /** ID đại lý / tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng vé trả về mỗi trang. */
  size: number;
  /** Sắp xếp theo ngày đặt cược hoặc ngày quay. */
  sortBy: TicketSortBy;
  /** Lọc từ ngày (YYYY-MM-DD), bao gồm. */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD), bao gồm. */
  to?: string;
  /** Con trỏ phân trang (cursor-based pagination). */
  cursor?: string;
}

export interface PlayerTicketSummary {
  /** ID vé (internal). */
  id: string;
  /** Mã vé hiển thị cho player. */
  ticketNo: string;
  /** Trạng thái vé (pending / won / lost / …). */
  status: string;
  drawPlan: {
    /** Danh sách drawId đã chọn. */
    drawIds: string[];
    /** Số kỳ quay. */
    drawCount: number;
  };
  pricing: {
    /** Đơn giá mỗi line (VND). */
    unitPrice: number;
    /** Tổng lines mỗi kỳ = Σ(board.lineCount). */
    linesPerDraw: number;
    /** Tiền cược mỗi kỳ = linesPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền cược = amountPerDraw × drawCount. */
    totalAmount: number;
  };
  /** Danh sách boards trong vé. */
  boards: Array<{
    /** Số thứ tự board (vd: "A", "B"). */
    boardNo: string;
    /** Kiểu chơi: basic | combo | plus. */
    playMode: string;
    /** Loại cược: direct | rumble. */
    playType: string;
    /** Bộ ba số đã chọn. */
    triplets: string[];
    /** Số lines phát sinh từ board này. */
    lineCount: number;
  }>;
  /** Tiến trình settle của vé. settledDraws = số kỳ đã xử lý xong (settled + voided). */
  progress: {
    /** Tổng số kỳ quay của vé. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong (settled + voided). */
    settledDraws: number;
  };
  /** Thông tin thanh toán (chỉ có khi đã settle ít nhất 1 kỳ). */
  settlement?: {
    /** Tổng tiền thắng cộng dồn (VND). */
    totalWinAmount: number;
    /** Thời điểm kỳ gần nhất được settle (ISO 8601). */
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. Max3D void theo board, không phải theo draw.
   * isFullVoid = true: toàn bộ vé bị huỷ → status = "refunded".
   * isFullVoid = false: một phần board bị huỷ, các kỳ còn lại vẫn chạy bình thường.
   */
  voidSummary?: {
    /** True nếu toàn bộ vé bị void. */
    isFullVoid: boolean;
    /** Danh sách boardNo bị void. */
    voidedBoards: string[];
    /** Tiền cược gốc trước khi void (VND). */
    originalAmount: number;
    /** Tiền đã hoàn trả cho player (VND). */
    refundAmount: number;
    /** Thời điểm void (ISO 8601). */
    voidedAt: string;
  };
  /** Thời điểm tạo vé (ISO 8601). */
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  /** Danh sách vé. */
  tickets: PlayerTicketSummary[];
  /** Con trỏ trang tiếp theo, null nếu hết dữ liệu. */
  nextCursor: string | null;
  /** Số lượng vé trả về. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** ID đại lý / tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** ID vé cần xem chi tiết entries. */
  ticketId: string;
}

export interface PlayerEntryInfo {
  /** ID entry. */
  id: string;
  /** ID kỳ quay tương ứng. */
  drawId: string;
  /** Trạng thái entry (pending / won / lost / …). */
  status: string;
  /** Tiền cược của entry (VND). */
  amount: number;
  /** Số lines = Σ(board.lineCount) trong entry. */
  lineCount: number;
  /** Tóm tắt entry (thông tin vé + boards). */
  entrySummary: {
    /** Mã vé hiển thị. */
    ticketNo: string;
    /** Danh sách boards trong entry. */
    boards: Array<{
      /** Số thứ tự board. */
      boardNo: string;
      /** Kiểu chơi. */
      playMode: string;
      /** Loại cược. */
      playType: string;
      /** Bộ ba số đã chọn. */
      triplets: string[];
      /** Số lines phát sinh từ board này. */
      lineCount: number;
    }>;
  };
  /** Kết quả kỳ quay (chỉ có sau khi công bố). */
  result?: {
    /** Giải đặc biệt (2 bộ ba số). */
    special: [string, string];
    /** Giải nhất (4 bộ ba số). */
    first: [string, string, string, string];
    /** Giải nhì (6 bộ ba số). */
    second: [string, string, string, string, string, string];
    /** Giải ba (8 bộ ba số). */
    third: [string, string, string, string, string, string, string, string];
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả tổng thể của entry (won / lost / pending). */
  outcome?: string;
  /** Chi tiết thanh toán (chỉ có khi đã settle). */
  payout?: {
    /** Tổng tiền thắng (VND). */
    winAmount: number;
    /** Số tiền thực nhận (VND). */
    payoutAmount: number;
    /** Chi tiết thắng theo từng giải. */
    tiers: Array<{
      /** Tên giải (special / first / second / third). */
      tier: string;
      /** Số lần trúng giải này. */
      hitCount: number;
      /** Tiền thưởng mỗi lần trúng (VND). */
      unitAmount: number;
      /** Tổng tiền thưởng giải này = hitCount × unitAmount. */
      amount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Thông tin tóm tắt của vé. */
  ticket: PlayerTicketSummary;
  /** Danh sách entries của vé. */
  entries: PlayerEntryInfo[];
}

// ─── Get Entry Lines (Player) ───

export interface PlayerGetEntryLinesInput {
  /** ID đại lý / tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** ID entry cần xem chi tiết lines. */
  entryId: string;
  /** Số lines mỗi trang. */
  size: number;
  /** lineIndex của phần tử cuối cùng trang trước (cursor). */
  cursor?: number;
}

export interface PlayerLineInfo {
  /** Số thứ tự board (vd: "A", "B"). */
  boardNo: string;
  /** Vị trí line trong board (0-based). */
  lineIndex: number;
  /** Kiểu chơi: basic | combo | plus. */
  playMode: string;
  /** Loại cược: direct | rumble. */
  playType: string;
  /** Bộ ba số của line. */
  triplets: string[];
  /** Kết quả so khớp. tier = null nếu không trúng. */
  matchResult: {
    /** Tên giải trúng, null nếu không trúng. */
    tier: string | null;
    /** Tiền thắng của line (VND). */
    winAmount: number;
  };
}

export interface PlayerGetEntryLinesOutput {
  /** ID entry. */
  entryId: string;
  /** ID kỳ quay. */
  drawId: string;
  /** Danh sách lines trong trang hiện tại. */
  lines: PlayerLineInfo[];
  /** Cursor cho trang tiếp theo. Null nếu hết dữ liệu. */
  nextCursor: number | null;
  /** Số lines mỗi trang. */
  size: number;
}

// ─── Draw Results (Player) ───

/** Thông tin giải thưởng 1 hạng trong kỳ quay — dùng cho GetDrawResult API. */
export interface PlayerDrawTierPrize {
  /** Tên hạng giải: "special", "first", "second", "third", "fourth", "fifth", "sixth". */
  tier: string;
  /** Số lượt trúng hạng này trong kỳ quay (tổng hit count). */
  winnerCount: number;
  /** Tổng tiền thưởng hạng này (VND). */
  prizeAmount: number;
}

/** Kết quả chi tiết 1 kỳ quay đã settle — dùng cho GetDrawResult API. */
export interface PlayerDrawResultInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  /** Kết quả quay thưởng. */
  result: {
    /** Giải Đặc Biệt (2 bộ ba số). */
    special: string[];
    /** Giải Nhất (4 bộ ba số). */
    first: string[];
    /** Giải Nhì (6 bộ ba số). */
    second: string[];
    /** Giải Ba (8 bộ ba số). */
    third: string[];
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Bảng giải thưởng theo từng hạng. */
  prizes: PlayerDrawTierPrize[];
  /** Tham chiếu kỳ quay Vietlott. */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/** Tóm tắt 1 kỳ quay trong danh sách — dùng cho ListDrawResults API. */
export interface PlayerDrawResultSummary {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  result: {
    special: string[];
    first: string[];
    second: string[];
    third: string[];
    publishedAt: string;
  };
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface PlayerListDrawResultsInput {
  /** Lấy các kỳ trước ngày này (YYYY-MM-DD), inclusive. Mặc định = hôm nay. */
  from: string;
  /** Số kỳ tối đa mỗi trang. */
  size: number;
  /** Cursor từ response trước: drawId kỳ cuối trang. */
  cursor?: string;
}

export interface PlayerListDrawResultsOutput {
  draws: PlayerDrawResultSummary[];
  /** Cursor cho trang tiếp theo. Null nếu hết kết quả. */
  nextCursor: string | null;
  size: number;
}
