import type { TicketProgress, TicketSettlement, TicketVoidSummary } from "@megawin/game-bingo18/entities";
import type { TicketAggregateResult } from "./entry.types";

/**
 * Kết quả aggregate từ entries — dùng để sync lại ticket document.
 *
 * Aggregate từ tất cả entries của 1 ticket (theo ticketId).
 * Dùng bởi SyncTicketSummaries sau mỗi batch settle/void.
 *
 * Extends TicketAggregateResult và bổ sung totalDraws từ ticket document.
 * totalDraws KHÔNG có trong entries → phải lấy từ ticket.drawPlan.drawCount.
 */
export interface TicketSummary extends TicketAggregateResult {
  /** Tổng kỳ của ticket — lấy từ ticket.drawPlan.drawCount. */
  totalDraws: number;
}
