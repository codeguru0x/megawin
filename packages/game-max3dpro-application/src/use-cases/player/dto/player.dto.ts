/**
 * Max 3D Pro – Player DTOs
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
    /** Số thứ tự kỳ quay. */
    drawNo: number;
    /** Giải Đặc biệt: 2 bộ ba số. */
    special: [string, string];
    /** Giải Nhất: 4 bộ ba số. */
    first: [string, string, string, string];
    /** Giải Nhì: 6 bộ ba số. */
    second: [string, string, string, string, string, string];
    /** Giải Ba: 8 bộ ba số. */
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
  /** Giờ quay (HH:mm). */
  drawTime: string;
  /** Trạng thái kỳ quay. */
  status: string;
  sales: {
    /** Thời điểm mở bán (ISO 8601). */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

// ─── List Tickets (Player) ───

export type TicketSortBy = "betDate" | "drawDate";

export const TICKET_SORT_BY_VALUES: readonly TicketSortBy[] = [
  "betDate",
  "drawDate",
];

export interface PlayerListPendingTicketsInput {
  /** ID tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng tối đa mỗi trang. */
  size: number;
  /** Con trỏ phân trang (cursor-based). */
  cursor?: string;
}

export interface PlayerListCompletedTicketsInput {
  /** ID tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng tối đa mỗi trang. */
  size: number;
  /** Sắp xếp theo: betDate | drawDate. */
  sortBy: TicketSortBy;
  /** Lọc từ ngày (YYYY-MM-DD). */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD). */
  to?: string;
  /** Con trỏ phân trang (cursor-based). */
  cursor?: string;
}

export interface PlayerTicketSummary {
  /** ID ticket (MongoDB ObjectId). */
  id: string;
  /** Mã vé hiển thị. */
  ticketNo: string;
  /** Trạng thái vé. */
  status: string;
  drawPlan: {
    /** Danh sách drawId. */
    drawIds: string[];
    /** Số kỳ quay. */
    drawCount: number;
  };
  pricing: {
    /** Đơn giá mỗi pair (VND). */
    unitPrice: number;
    /** Tổng pairs mỗi kỳ. */
    linesPerDraw: number;
    /** Tiền cược mỗi kỳ (VND). */
    amountPerDraw: number;
    /** Tổng tiền cược (VND). */
    totalAmount: number;
  };
  boards: Array<{
    /** Số thứ tự board. */
    boardNo: string;
    /** Kiểu chơi. */
    playMode: string;
    /** Loại cược. */
    playType: string;
    /** Danh sách bộ ba số. */
    triplets: string[];
    /** Các số đầu (dùng cho multiNumber). */
    frontDigits?: number[];
    /** Các số cuối (dùng cho multiNumber). */
    backDigits?: number[];
    /** Số pairs trong board. Với multiNumber: C(n,2). */
    lineCount: number;
  }>;
  progress: {
    /** Tổng kỳ quay của vé. */
    totalDraws: number;
    /** Số kỳ đã settle. */
    settledDraws: number;
  };
  settlement?: {
    /** Tổng tiền thắng tích lũy (VND). */
    totalWinAmount: number;
  };
  /** Thời điểm tạo vé (ISO 8601). */
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  /** Danh sách vé. */
  tickets: PlayerTicketSummary[];
  /** Con trỏ trang tiếp, null nếu hết. */
  nextCursor: string | null;
  /** Kích thước trang thực tế. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** ID tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** ID vé cần lấy entries. */
  ticketId: string;
}

export interface PlayerEntryInfo {
  /** ID entry. */
  id: string;
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay. */
  drawDate: string;
  /** Giờ quay. */
  drawTime: string;
  /** Trạng thái entry. */
  status: string;
  /** Tiền cược entry (VND). */
  amount: number;
  /** Số pairs = Σ(board.lineCount) trong entry. */
  lineCount: number;
  entrySummary: {
    /** Mã vé hiển thị. */
    ticketNo: string;
    boards: Array<{
      /** Số thứ tự board. */
      boardNo: string;
      /** Kiểu chơi. */
      playMode: string;
      /** Loại cược. */
      playType: string;
      /** Danh sách bộ ba số. */
      triplets: string[];
      /** Các số đầu (dùng cho multiNumber). */
      frontDigits?: number[];
      /** Các số cuối (dùng cho multiNumber). */
      backDigits?: number[];
      /** Số pairs trong board. */
      lineCount: number;
    }>;
  };
  result?: {
    /** Giải Đặc biệt: 2 bộ ba số. */
    special: [string, string];
    /** Giải Nhất: 4 bộ ba số. */
    first: [string, string, string, string];
    /** Giải Nhì: 6 bộ ba số. */
    second: [string, string, string, string, string, string];
    /** Giải Ba: 8 bộ ba số. */
    third: [string, string, string, string, string, string, string, string];
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả tổng: 'win' | 'loss'. */
  outcome?: string;
  payout?: {
    /** Tổng tiền thắng (VND). */
    winAmount: number;
    /** Tổng tiền trả (VND). */
    payoutAmount: number;
    tiers: Array<{
      /** Tên tier giải. */
      tier: string;
      /** Số lần trúng tier. */
      hitCount: number;
      /** Tiền thưởng mỗi lần trúng (VND). */
      unitAmount: number;
      /** Tổng tiền tier = hitCount × unitAmount (VND). */
      amount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Thông tin tổng hợp vé. */
  ticket: PlayerTicketSummary;
  /** Danh sách entries của vé. */
  entries: PlayerEntryInfo[];
}

// ─── Get Entry Lines (Player) ───

export interface PlayerGetEntryLinesInput {
  /** ID tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** ID entry cần lấy lines. */
  entryId: string;
  /** Số lượng lines mỗi trang. */
  size: number;
  /** lineIndex của phần tử cuối cùng trang trước (cursor). */
  cursor?: number;
}

export interface PlayerLineInfo {
  /** Số board. */
  boardNo: string;
  /** Vị trí line trong entry (0-based). */
  lineIndex: number;
  /** Kiểu chơi. */
  playMode: string;
  /** Loại cược. */
  playType: string;
  /** Cặp hai bộ ba số của line. */
  triplets: string[];
  /** Kết quả so khớp. tier = null nếu không trúng. */
  matchResult: {
    tier: string | null;
    winAmount: number;
  };
}

export interface PlayerGetEntryLinesOutput {
  /** ID entry. */
  entryId: string;
  /** ID kỳ quay. */
  drawId: string;
  /** Danh sách lines. */
  lines: PlayerLineInfo[];
  /** Cursor cho trang tiếp theo. Null nếu hết dữ liệu. */
  nextCursor: number | null;
  /** Kích thước trang. */
  size: number;
}
