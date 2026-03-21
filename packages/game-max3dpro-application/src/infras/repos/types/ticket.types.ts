/**
 * Ticket infrastructure types — dùng cho TicketRepository.
 */

/**
 * Kết quả aggregate từ entries cho 1 ticket.
 * Dùng để sync lại ticket document qua bulkSyncSummaries.
 */
export interface TicketSummary {
  settledCount: number;
  voidedCount: number;
  /** Tổng kỳ của ticket — lấy từ ticket.drawPlan.drawCount. */
  totalDraws: number;
  totalWinAmount: number;
  totalVoidedAmount: number;
  totalRefundedAmount: number;
  voidedDrawIds: string[];
}
