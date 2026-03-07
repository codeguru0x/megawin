/**
 * Keno – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 */

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  currentDraw: PlayerDrawInfo | null;
  activeDraws: PlayerDrawInfo[];
  lastResult: {
    drawId: string;
    drawDate: string;
    drawNo: number;
    winningNumbers: string[];
    publishedAt: string;
  } | null;
}

export interface PlayerDrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: {
    openAt?: string;
    closeAt: string;
  };
}

// ─── List Tickets (Player) ───

/**
 * Cursor-based pagination cho danh sách vé.
 *
 * Tại sao cursor thay vì page/offset?
 * - Collection kenoTickets có thể hàng triệu docs.
 * - skip(page*size) phải scan qua tất cả docs bỏ qua → O(skip+limit), chậm ở page lớn.
 * - Cursor dùng range query trên indexed field (_id hoặc createdAt) → O(limit) luôn.
 */

export const TicketSortBy = {
  BetDate: "betDate",
  DrawDate: "drawDate",
} as const;

export type TicketSortBy = (typeof TicketSortBy)[keyof typeof TicketSortBy];

export const TICKET_SORT_BY_VALUES = Object.values(TicketSortBy);

export interface PlayerListTicketsInput {
  tenantId: string;
  accountId: string;
  size: number;
  from?: string;
  to?: string;
  cursor?: string;
}

export interface PlayerListPendingTicketsInput {
  tenantId: string;
  accountId: string;
  size: number;
  from?: string;
  to?: string;
  cursor?: string;
}

export interface PlayerListCompletedTicketsInput {
  tenantId: string;
  accountId: string;
  size: number;
  sortBy: TicketSortBy;
  /** ISO date string, lọc tickets hoàn thành từ ngày này. */
  from?: string;
  /** ISO date string, lọc tickets hoàn thành đến ngày này. */
  to?: string;
  cursor?: string;
}

export interface PlayerTicketSummary {
  id: string;
  ticketNo: string;
  status: string;
  drawPlan: {
    drawIds: string[];
    drawCount: number;
  };
  pricing: {
    unitPrice: number;
    betsPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  boards: Array<{
    boardNo: string;
    playType: string;
    numbers: string[];
  }>;
  sideBets: Array<{
    playType: string;
    bet: string;
  }>;
  /**
   * Tiến trình xử lý — settledDraws = số kỳ đã hoàn tất (settled + voided).
   * Để biết cụ thể bao nhiêu kỳ voided, xem voidSummary.voidedDrawCount.
   */
  progress: {
    totalDraws: number;
    settledDraws: number;
  };
  /** Tổng kết thắng cược. Undefined nếu chưa có kỳ nào settle. */
  settlement?: {
    totalWinAmount: number;
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. Có khi ít nhất 1 kỳ bị void.
   * Multi-draw: hoàn tiền một phần.
   * Single-draw: hoàn toàn bộ, status = "refunded".
   */
  voidSummary?: {
    totalVoidedAmount: number;
    totalRefundedAmount: number;
    voidedDrawCount: number;
    voidedDrawIds: string[];
    lastVoidedAt?: string;
  };
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  tickets: PlayerTicketSummary[];
  nextCursor: string | null;
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  tenantId: string;
  accountId: string;
  ticketId: string;
}

export interface PlayerEntryInfo {
  id: string;
  drawId: string;
  drawDate: string;
  status: string;
  amount: number;
  betCount: number;
  entrySummary: {
    ticketNo: string;
    boards: Array<{
      boardNo: string;
      playType: string;
      numbers: string[];
    }>;
    sideBets: Array<{
      playType: string;
      bet: string;
    }>;
  };
  result?: {
    winningNumbers: string[];
    publishedAt: string;
    bigCount: number;
    smallCount: number;
    evenCount: number;
    oddCount: number;
  };
  outcome?: string;
  payout?: {
    winAmount: number;
    payoutAmount: number;
    boardPayouts: Array<{
      boardNo: string;
      playType: string;
      matchCount: number;
      pickCount: number;
      winAmount: number;
    }>;
    sideBetPayouts: Array<{
      playType: string;
      bet: string;
      outcome: string;
      isWin: boolean;
      winAmount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  ticket: PlayerTicketSummary;
  entries: PlayerEntryInfo[];
}
