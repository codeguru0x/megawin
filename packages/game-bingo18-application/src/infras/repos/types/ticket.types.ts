import type {
  TicketProgress,
  TicketSettlement,
  TicketVoidSummary,
} from "@megawin/game-bingo18/entities";

/**
 * Kết quả aggregate từ entries — dùng để sync lại ticket document.
 *
 * Aggregate từ tất cả entries của 1 ticket (theo ticketId).
 * Dùng bởi SyncTicketSummaries sau mỗi batch settle/void.
 */
export interface TicketSummary {
  /** Số kỳ đã settle. */
  settledCount: number;
  /** Số kỳ đã void. */
  voidedCount: number;
  /** Tổng kỳ của ticket — lấy từ ticket.drawPlan.drawCount. */
  totalDraws: number;
  /** Tổng tiền thắng của tất cả kỳ đã settle (VND). */
  totalWinAmount: number;
  /** Tổng tiền cược của các kỳ bị void (VND). */
  totalVoidedAmount: number;
  /** Tổng tiền đã hoàn trả (VND). */
  totalRefundedAmount: number;
  /** Danh sách drawId các kỳ bị void. */
  voidedDrawIds: string[];
}

/**
 * Typed $set payload cho ticket sync — đảm bảo dot notation khớp với entity.
 *
 * Dùng trong bulkSyncSummaries và syncSummary.
 * Partial update — chỉ set các field liên quan đến settle/void.
 */
export type TicketSyncSet = {
  "progress.settledDraws": TicketProgress["settledDraws"];
  updatedAt: Date;
  "settlement.totalWinAmount"?: TicketSettlement["totalWinAmount"];
  "settlement.lastSettledAt"?: Date;
  "voidSummary.voidedDrawCount"?: TicketVoidSummary["voidedDrawCount"];
  "voidSummary.totalVoidedAmount"?: TicketVoidSummary["totalVoidedAmount"];
  "voidSummary.totalRefundedAmount"?: TicketVoidSummary["totalRefundedAmount"];
  "voidSummary.voidedDrawIds"?: TicketVoidSummary["voidedDrawIds"];
  "voidSummary.lastVoidedAt"?: Date;
  status?: string;
};
